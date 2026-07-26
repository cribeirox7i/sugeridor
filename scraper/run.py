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
import sys
import traceback

from . import categorize, db, enrich, pipeline
from .config import MAX_WORKERS, require_config
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

    # Carrega as palavras-chave de categoria (category_keywords) 1x, antes
    # dos workers paralelos — evita 1 query por produto classificado.
    categorize.load_keywords()

    total_failures = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(_process_store, row) for row in rows]
        for future in concurrent.futures.as_completed(futures):
            if future.result():
                total_failures += 1

    # Passos sobre o catálogo inteiro, depois que todas as lojas terminaram
    # (não faz sentido rodar por-loja: expiração e unificação de país olham
    # o todo, não uma loja isolada).
    try:
        expiration_days = enrich.get_offer_expiration_days()
        expired = enrich.expire_stale_offers(expiration_days)
        print(f"Expiração: {expired} oferta(s) desativada(s) (>{expiration_days} dias sem ver).")

        own_brand, own_country = enrich.apply_own_store_defaults()
        print(
            f"Lojas próprias: {own_brand} produto(s) com marca herdada da loja, "
            f"{own_country} com país herdado da loja."
        )

        unified = enrich.unify_brand_country()
        print(f"Enriquecimento: {unified} produto(s) com país preenchido a partir da marca.")
    except Exception as e:  # noqa: BLE001 — enriquecimento não deve derrubar o exit code da coleta
        traceback.print_exc()
        print(f"Enriquecimento pós-coleta falhou: {e}")

    return 1 if total_failures else 0


if __name__ == "__main__":
    sys.exit(run())
