"""Ponto de entrada do scraper (rodado pelo GitHub Actions).

Lê as lojas que têm `platform` definido, roda o coletor genérico daquela
plataforma (config-driven — ver scraper/platforms/), grava os resultados e
registra cada execução em ingestion_jobs. Um erro em uma loja não derruba as
outras.

Lojas são processadas em paralelo (threads, ver MAX_WORKERS em config.py):
são hosts diferentes, então rodar em série significa que o tempo total é a
SOMA do tempo de cada loja — inviável com 100+ lojas cadastradas. O rate
limit por host (http.py) garante que isso não vira uma coleta agressiva
contra nenhum site individual, só permite que lojas diferentes andem ao
mesmo tempo.
"""
import concurrent.futures
import hashlib
import sys
import traceback

from . import categorize, db, enrich, pipeline
from .config import MAX_WORKERS, SHARD_INDEX, SHARD_TOTAL, STORE_IDS, require_config
from .models import StoreRecord
from .platforms import get_collector


def _process_store(row: dict) -> bool:
    """Coleta e grava uma loja. Retorna True se a loja falhou."""
    store = StoreRecord(
        id=row["id"],
        name=row["name"],
        site_url=row.get("site_url") or "",
        platform=row["platform"],
        config=row.get("config") or {},
        store_type=row.get("store_type") or "marketplace",
        country=row.get("country") or "Brasil",
    )
    collector = get_collector(store.platform)
    if collector is None:
        print(f"[{store.name}] platform '{store.platform}' não registrada — pulando.")
        return False
    if not store.site_url:
        print(f"[{store.name}] sem site_url — pulando.")
        return False

    print(f"[{store.name}] coletando ({store.platform}) de {store.site_url} ...")
    job_id = pipeline.start_job(store.id)
    try:
        candidates = collector(store)
        new_count = pipeline.process_candidates(candidates, store)
        pipeline.finish_job(job_id, status="success", found=len(candidates), new=new_count)
        print(f"[{store.name}] OK — {len(candidates)} ofertas ({new_count} produtos novos).")
        return False
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        pipeline.finish_job(job_id, status="failed", found=0, new=0, error=str(e)[:500])
        print(f"[{store.name}] FALHOU — {e}")
        return True


def _belongs_to_shard(store_id: str) -> bool:
    """Distribui as lojas entre as execuções paralelas (ver SHARD_* em
    config.py).

    A fatia sai de um hash do id da loja, não da posição dela na lista: assim
    cadastrar (ou desmarcar) uma loja não remaneja todas as outras entre os
    shards. `hash()` do Python não serve porque varia entre processos por
    causa do PYTHONHASHSEED — md5 é estável e aqui não tem nada de
    criptográfico em jogo."""
    if SHARD_TOTAL <= 1:
        return True
    digest = hashlib.md5(store_id.encode()).hexdigest()
    return int(digest, 16) % SHARD_TOTAL == SHARD_INDEX


def run_enrichment() -> int:
    """Passos sobre o catálogo INTEIRO — expiração de ofertas velhas e
    unificação de marca/país.

    Roda uma vez só, depois de todas as lojas: com sharding, cada execução vê
    apenas a sua fatia, então rodar isso em N shards seria N vezes o mesmo
    trabalho sobre o catálogo completo, em paralelo e disputando as mesmas
    linhas. No workflow é um job separado que depende de todos os shards."""
    try:
        expiration_days = enrich.get_offer_expiration_days()
        expired = enrich.expire_stale_offers(expiration_days)
        print(
            f"Expiração: {expired} oferta(s) desativada(s) "
            f"(prazo padrão {expiration_days} dias; lojas podem ter o próprio)."
        )

        own_brand, own_country = enrich.apply_own_store_defaults()
        print(
            f"Lojas próprias: {own_brand} produto(s) com marca herdada da loja, "
            f"{own_country} com país herdado da loja."
        )

        unified = enrich.unify_brand_country()
        print(f"Enriquecimento: {unified} produto(s) com país preenchido a partir da marca.")
        return 0
    except Exception as e:  # noqa: BLE001 — enriquecimento não deve derrubar o exit code da coleta
        traceback.print_exc()
        print(f"Enriquecimento pós-coleta falhou: {e}")
        return 0


def run() -> int:
    require_config()

    rows = db.select(
        "stores",
        {
            "platform": "not.is.null",
            "include_in_collection": "eq.true",
            "select": "id,name,site_url,platform,config,store_type,country",
        },
    )
    if not rows:
        print("Nenhuma loja com platform definido. Nada a fazer.")
        return 0

    # Seleção explícita de lojas (botão "Coletar selecionadas" do admin) vem
    # antes do sharding: a fatia é calculada sobre o que foi pedido.
    if STORE_IDS:
        selected = set(STORE_IDS)
        rows = [r for r in rows if r["id"] in selected]
        print(f"Seleção manual: {len(rows)} de {len(STORE_IDS)} loja(s) pedida(s) elegível(is).")
        if not rows:
            print("Nenhuma das lojas pedidas está com coleta habilitada. Nada a fazer.")
            return 0

    total_stores = len(rows)
    rows = [r for r in rows if _belongs_to_shard(r["id"])]
    if SHARD_TOTAL > 1:
        print(
            f"Shard {SHARD_INDEX + 1}/{SHARD_TOTAL}: {len(rows)} de {total_stores} "
            f"loja(s) nesta execução."
        )
        if not rows:
            print("Nenhuma loja nesta fatia. Nada a fazer.")
            return 0

    # Carrega as palavras-chave de categoria (category_keywords) 1x, antes
    # dos workers paralelos — evita 1 query por produto classificado.
    categorize.load_keywords()

    total_failures = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(_process_store, row) for row in rows]
        for future in concurrent.futures.as_completed(futures):
            if future.result():
                total_failures += 1

    # Sem sharding, a execução é única e já pode enriquecer aqui mesmo. Com
    # sharding, quem faz isso é o job final do workflow (--enrich-only).
    if SHARD_TOTAL <= 1:
        run_enrichment()

    return 1 if total_failures else 0


if __name__ == "__main__":
    # `--enrich-only`: usado pelo job final do workflow, que espera todos os
    # shards terminarem antes de mexer no catálogo inteiro.
    if "--enrich-only" in sys.argv:
        require_config()
        sys.exit(run_enrichment())
    sys.exit(run())
