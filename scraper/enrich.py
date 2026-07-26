"""Passos de enriquecimento/limpeza rodados depois da coleta de todas as
lojas (ver run.py) — não são por-loja, são sobre o catálogo inteiro."""
from datetime import datetime, timedelta, timezone

from . import db

_DEFAULT_EXPIRATION_DAYS = 45
_BATCH_SIZE = 100  # mesma cautela de URL grande do front (ver web/src/lib/queries.ts)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_offer_expiration_days() -> int:
    rows = db.select("site_settings", {"id": "eq.1", "select": "offer_expiration_days"})
    if rows and rows[0].get("offer_expiration_days"):
        return int(rows[0]["offer_expiration_days"])
    return _DEFAULT_EXPIRATION_DAYS


def expire_stale_offers(expiration_days: int) -> int:
    """Desativa ofertas ativas cujo `last_seen_at` é mais antigo que
    `expiration_days` — sinal de que a loja parou de vender aquele produto
    (ou o scraper parou de achá-lo nas últimas coletas). Só marca
    active=false; nunca apaga a oferta nem o histórico de preço."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=expiration_days)).isoformat()
    stale = db.select(
        "offers",
        {"active": "eq.true", "last_seen_at": f"lt.{cutoff}", "select": "id"},
    )
    if not stale:
        return 0

    ids = [row["id"] for row in stale]
    now = _now_iso()
    for i in range(0, len(ids), _BATCH_SIZE):
        batch = ids[i : i + _BATCH_SIZE]
        db.update(
            "offers",
            {"id": f"in.({','.join(batch)})"},
            {"active": False, "updated_at": now},
        )
    return len(ids)


def apply_own_store_defaults() -> tuple[int, int]:
    """Pra lojas 'propria' (a própria cervejaria vendendo o produto dela,
    não um marketplace revendendo terceiros), produtos vendidos por ela sem
    marca ou sem país herdam o nome e o país da loja — só completa o que
    falta, nunca sobrescreve (mesmo princípio de backfill do resto do
    pipeline). Roda antes de `unify_brand_country()`: o país da própria
    loja é um sinal mais confiável do que a moda entre marcas."""
    stores = db.select("stores", {"store_type": "eq.propria", "select": "id,name,country"})
    if not stores:
        return (0, 0)

    brand_updated = 0
    country_updated = 0
    for store in stores:
        offers = db.select("offers", {"store_id": f"eq.{store['id']}", "select": "product_id"})
        product_ids = {o["product_id"] for o in offers}

        for pid in product_ids:
            rows = db.select("products", {"id": f"eq.{pid}", "select": "id,brand,attributes"})
            if not rows:
                continue
            product = rows[0]
            patch: dict = {}

            if not product.get("brand"):
                patch["brand"] = store["name"]

            attrs = dict(product.get("attributes") or {})
            if not attrs.get("pais") and store.get("country"):
                attrs["pais"] = store["country"]
                patch["attributes"] = attrs

            if patch:
                db.update("products", {"id": f"eq.{pid}"}, patch)
                if "brand" in patch:
                    brand_updated += 1
                if "attributes" in patch:
                    country_updated += 1

    return brand_updated, country_updated


def unify_brand_country() -> int:
    """Preenche `attributes.pais` ausente usando o valor mais comum entre
    produtos da MESMA marca — mesmo princípio de backfill do resto do
    pipeline: só completa quem não tem, nunca sobrescreve um país já
    gravado (pode ter sido corrigido à mão no admin)."""
    rows = db.select("products", {"brand": "not.is.null", "select": "id,brand,attributes"})

    by_brand: dict[str, list[dict]] = {}
    for row in rows:
        by_brand.setdefault(row["brand"], []).append(row)

    updated = 0
    for items in by_brand.values():
        counts: dict[str, int] = {}
        for row in items:
            pais = (row.get("attributes") or {}).get("pais")
            if pais:
                counts[pais] = counts.get(pais, 0) + 1
        if not counts:
            continue
        common_pais = max(counts, key=counts.get)

        for row in items:
            attrs = dict(row.get("attributes") or {})
            if attrs.get("pais"):
                continue
            db.update("products", {"id": f"eq.{row['id']}"}, {"attributes": {**attrs, "pais": common_pais}})
            updated += 1

    return updated
