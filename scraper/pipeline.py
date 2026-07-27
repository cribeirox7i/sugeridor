"""Consome candidatos e grava no banco: acha/cria produto, faz upsert da oferta
e registra o ponto de histórico de preço. Ver docs/04-conectores-ingestao.md.

Trabalha em LOTE (`process_candidates`), não um candidato por vez: antes eram
3 round-trips ao Supabase por produto (select do slug, upsert da oferta,
insert do histórico), o que a 100+ lojas × 200 itens dá ~60 mil requests e
estoura o tempo de job por pura latência. Agora é um punhado de requests por
loja, independente de quantos produtos ela tem.
"""
import threading
from datetime import datetime, timezone

from . import db
from .categorize import classify_category
from .models import Candidate, StoreRecord
from .normalize import normalize_dashes, prefix_brand, product_slug, title_case_pt

_type_cache: dict[str, str] = {}
_type_cache_lock = threading.Lock()

# Lote de slugs por consulta de produtos existentes. Slugs são longos, e uma
# cláusula `in.(...)` gigante gera URL que estoura limite de header (mesma
# cautela de web/src/lib/queries.ts).
_SLUG_LOOKUP_BATCH = 50


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def product_type_id(slug: str) -> str:
    # run.py processa lojas em paralelo — protege o cache pra não disparar o
    # mesmo select duas vezes na corrida do primeiro acesso.
    with _type_cache_lock:
        if slug not in _type_cache:
            rows = db.select("product_types", {"slug": f"eq.{slug}", "select": "id"})
            if not rows:
                raise SystemExit(f"product_type '{slug}' não existe — rode a migration de seed.")
            _type_cache[slug] = rows[0]["id"]
        return _type_cache[slug]


def _resolve_identity(cand: Candidate, store: StoreRecord) -> tuple[str, str | None, dict]:
    """Nome, marca e atributos finais do candidato — a identidade do produto.

    Numa loja 'propria' (a própria cervejaria vendendo o produto dela), a
    marca É a loja e o país É o da loja: o que a fonte informa como "marca"
    não é confiável nesse caso (o `vendor` do Shopify da Japas, por exemplo,
    traz o estilo: "BOHEMIAN PILSENER | 5% ALC."). Por isso SOBRESCREVE em vez
    de só completar o que falta.

    E o NOME ganha a marca na frente quando ela não está lá: o nome de um
    produto é marca + descritivo. A Dogma chama sua cerveja de "IPA" porque no
    site dela isso basta; num agregador ao lado de dez outras IPAs, o produto é
    "Dogma IPA" — mesma razão de "Fanta Laranja" não ser só "Laranja". Só vale
    pra loja própria, onde a marca é confiável: no marketplace o `vendor` traz
    razão social ("PAULANER BRAUEREI GRUPPE GMBH & CO. KGAA"), distribuidor ou
    placeholder ("MARCA PROPRIA"), e prefixar pioraria o nome.

    Roda antes do slug ser calculado — o slug deriva de marca+nome, então
    corrigir isso depois (como fazia o pós-processamento em enrich.py) deixaria
    o slug errado pra sempre."""
    brand = normalize_dashes(cand.brand) if cand.brand else cand.brand
    attributes = dict(cand.attributes)
    name = cand.product_name

    if store.store_type == "propria":
        brand = store.brand  # apelido, ou o nome da loja se não houver
        name = prefix_brand(name, brand)
        if store.country:
            attributes["pais"] = store.country

    return name, brand, attributes


def process_candidates(candidates: list[Candidate], store: StoreRecord) -> int:
    """Grava todos os candidatos de uma loja. Retorna quantos produtos novos
    foram criados.

    Preço <= 0 normalmente significa item sem preço de verdade (fora de
    estoque, erro de parsing, placeholder do site) — não vale nem produto nem
    oferta nem ponto de histórico, então descarta o candidato antes de tocar
    no banco."""
    prepared: list[dict] = []
    seen_slugs: set[str] = set()

    for cand in candidates:
        if cand.price <= 0:
            continue

        # product_name já sai normalizado de clean_product_name (todo coletor
        # passa por lá); aqui ele pode ganhar a marca na frente.
        name, brand, attributes = _resolve_identity(cand, store)
        slug = product_slug(brand, name)
        # Dois candidatos com o mesmo slug seriam o mesmo produto: mantém o
        # primeiro. Sem isso o insert em lote quebraria no unique do slug e o
        # upsert de ofertas quebraria no par (product_id, store_id).
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        prepared.append(
            {"cand": cand, "name": name, "brand": brand, "attributes": attributes, "slug": slug}
        )

    if not prepared:
        return 0

    # ── 1. Quais produtos já existem? (uma consulta por lote de slugs) ──
    existing: dict[str, dict] = {}
    slugs = [p["slug"] for p in prepared]
    for i in range(0, len(slugs), _SLUG_LOOKUP_BATCH):
        batch = slugs[i : i + _SLUG_LOOKUP_BATCH]
        quoted = ",".join(f'"{s}"' for s in batch)
        rows = db.select(
            "products",
            {"canonical_slug": f"in.({quoted})", "select": "id,canonical_slug,image_url,attributes"},
        )
        for row in rows:
            existing[row["canonical_slug"]] = row

    # ── 2. Backfill dos que já existiam (imagem/atributos que faltavam) ──
    # Só completa chaves ausentes, nunca sobrescreve o que já está lá (pode
    # ter sido curado à mão no admin) — exceção é a loja 'propria', cujo
    # país/marca são autoridade e já vieram resolvidos acima.
    patches: list[dict] = []
    for p in prepared:
        row = existing.get(p["slug"])
        if not row:
            continue
        patch: dict = {}

        if not row.get("image_url") and p["cand"].image_url:
            patch["image_url"] = p["cand"].image_url

        current_attrs = dict(row.get("attributes") or {})
        missing = {k: v for k, v in p["attributes"].items() if k not in current_attrs}
        # Loja própria: o país da loja é autoridade, então corrige mesmo se já
        # houver valor — mas só quando de fato difere, senão todo produto da
        # loja geraria um patch inútil a cada coleta.
        if store.store_type == "propria":
            pais = p["attributes"].get("pais")
            if pais and current_attrs.get("pais") != pais:
                missing["pais"] = pais
        if missing:
            patch["attributes"] = {**current_attrs, **missing}

        if patch:
            patches.append({"id": row["id"], **patch})

    if patches:
        db.update_by_id_many("products", patches)

    # ── 3. Cria os produtos novos, num insert em lote ──
    to_create = [p for p in prepared if p["slug"] not in existing]
    if to_create:
        type_id = product_type_id(to_create[0]["cand"].product_type_slug)
        created = db.insert_many(
            "products",
            [
                {
                    "product_type_id": type_id,
                    # Title Case no título (CAIXA ALTA foi pedido antes e
                    # depois revertido); `name` já vem com a marca na frente
                    # quando a loja é própria (ver _resolve_identity).
                    "name": title_case_pt(p["name"]),
                    "brand": p["brand"],
                    "attributes": p["attributes"],
                    "image_url": p["cand"].image_url,
                    "canonical_slug": p["slug"],
                    # Categoria pelo nome ORIGINAL da fonte: o prefixo de
                    # marca poderia introduzir uma palavra-chave por acidente
                    # (uma cervejaria chamada "Copo" classificaria tudo como
                    # copo).
                    "category": classify_category(p["cand"].product_name),
                }
                for p in to_create
            ],
        )
        for row in created:
            existing[row["canonical_slug"]] = row

    # ── 4. Ofertas e histórico de preço, também em lote ──
    now = _now()
    offer_rows = []
    price_by_product: dict[str, float] = {}
    for p in prepared:
        row = existing.get(p["slug"])
        if not row:
            continue  # produto não criado (ex: lote rejeitado) — nada a fazer
        offer_rows.append(
            {
                "product_id": row["id"],
                "store_id": store.id,
                "price": p["cand"].price,
                "currency": p["cand"].currency,
                "url": p["cand"].url,
                "source_type": "scrape",
                "active": p["cand"].available,
                "last_seen_at": now,
                "updated_at": now,
            }
        )
        price_by_product[row["id"]] = p["cand"].price

    if not offer_rows:
        return len(to_create)

    # Preço que já está gravado, ANTES do upsert sobrescrever — é o que diz se
    # o preço mudou. Uma query por loja (paginada), não por oferta.
    previous_price: dict[str, float] = {}
    for row in db.select("offers", {"store_id": f"eq.{store.id}", "select": "product_id,price"}):
        if row.get("price") is not None:
            previous_price[row["product_id"]] = float(row["price"])

    offers = db.upsert_many("offers", offer_rows, on_conflict="product_id,store_id")

    # Ponto de histórico SÓ quando o preço muda (ou na primeira vez que se vê a
    # oferta). Gravar um ponto por coleta, mesmo com preço idêntico, fazia a
    # tabela crescer por tempo em vez de por informação: a projeção com 150
    # lojas dava ~4,9 milhões de linhas/ano, quase tudo repetido. E repetição
    # ainda atrapalhava a leitura do dado — a média do histórico anterior
    # (base do selo "-X%") ficava diluída por dezenas de pontos iguais, então
    # uma queda real aparecia menor do que é.
    # `offers.last_seen_at` continua sendo atualizado a cada coleta, então a
    # informação de "a loja ainda vende isso" não se perde (é o que a
    # expiração usa).
    history = []
    for o in offers:
        product_id = o.get("product_id")
        if product_id not in price_by_product:
            continue
        price = price_by_product[product_id]
        before = previous_price.get(product_id)
        if before is None or abs(before - price) > 0.001:  # tolerância de float
            history.append({"offer_id": o["id"], "price": price, "captured_at": now})

    if history:
        db.insert_many("price_history", history, returning=False)
    print(
        f"[{store.name}] histórico: {len(history)} ponto(s) novo(s) "
        f"de {len(offers)} oferta(s) (só o que mudou de preço)."
    )

    return len(to_create)


# ── ingestion_jobs ────────────────────────────────────────────────
def start_job(store_id: str) -> str:
    row = db.insert(
        "ingestion_jobs",
        {"job_type": "scrape", "store_id": store_id, "status": "running", "started_at": _now()},
    )
    return row["id"]


def finish_job(job_id: str, *, status: str, found: int, new: int, error: str | None = None) -> None:
    db.update(
        "ingestion_jobs",
        {"id": f"eq.{job_id}"},
        {
            "status": status,
            "items_found": found,
            "items_new": new,
            "error_message": error,
            "finished_at": _now(),
        },
    )
