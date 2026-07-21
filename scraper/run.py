"""Ponto de entrada do scraper (rodado pelo GitHub Actions).

Lê as lojas que têm `scraper_key` definido, roda o scraper correspondente,
grava os resultados e registra cada execução em ingestion_jobs. Um erro em uma
loja não derruba as outras.
"""
import sys
import traceback

from . import db, pipeline
from .config import require_config
from .stores import get_scraper


def run() -> int:
    require_config()

    stores = db.select(
        "stores",
        {"scraper_key": "not.is.null", "select": "id,name,site_url,scraper_key"},
    )
    if not stores:
        print("Nenhuma loja com scraper_key definido. Nada a fazer.")
        return 0

    total_failures = 0

    for store in stores:
        name = store["name"]
        scraper = get_scraper(store["scraper_key"])
        if scraper is None:
            print(f"[{name}] scraper_key '{store['scraper_key']}' não registrado — pulando.")
            continue
        if not store.get("site_url"):
            print(f"[{name}] sem site_url (URL de listagem) — pulando.")
            continue

        print(f"[{name}] coletando de {store['site_url']} ...")
        job_id = pipeline.start_job(store["id"])
        try:
            candidates = scraper(store["site_url"])
            new_count = 0
            for cand in candidates:
                if pipeline.process_candidate(cand, store["id"]):
                    new_count += 1
            pipeline.finish_job(
                job_id, status="success", found=len(candidates), new=new_count
            )
            print(f"[{name}] OK — {len(candidates)} ofertas ({new_count} produtos novos).")
        except Exception as e:  # noqa: BLE001
            total_failures += 1
            traceback.print_exc()
            pipeline.finish_job(
                job_id, status="failed", found=0, new=0, error=str(e)[:500]
            )
            print(f"[{name}] FALHOU — {e}")

    return 1 if total_failures else 0


if __name__ == "__main__":
    sys.exit(run())
