"""Ponto de entrada do scraper (rodado pelo GitHub Actions).

Lê as lojas que têm `platform` definido, roda o coletor genérico daquela
plataforma (config-driven — ver scraper/platforms/), grava os resultados e
registra cada execução em ingestion_jobs. Um erro em uma loja não derruba as
outras.
"""
import sys
import traceback

from . import db, pipeline
from .config import require_config
from .models import StoreRecord
from .platforms import get_collector


def run() -> int:
    require_config()

    rows = db.select(
        "stores",
        {"platform": "not.is.null", "select": "id,name,site_url,platform,config"},
    )
    if not rows:
        print("Nenhuma loja com platform definido. Nada a fazer.")
        return 0

    total_failures = 0

    for row in rows:
        store = StoreRecord(
            id=row["id"],
            name=row["name"],
            site_url=row.get("site_url") or "",
            platform=row["platform"],
            config=row.get("config") or {},
        )
        collector = get_collector(store.platform)
        if collector is None:
            print(f"[{store.name}] platform '{store.platform}' não registrada — pulando.")
            continue
        if not store.site_url:
            print(f"[{store.name}] sem site_url — pulando.")
            continue

        print(f"[{store.name}] coletando ({store.platform}) de {store.site_url} ...")
        job_id = pipeline.start_job(store.id)
        try:
            candidates = collector(store)
            new_count = 0
            for cand in candidates:
                if pipeline.process_candidate(cand, store.id):
                    new_count += 1
            pipeline.finish_job(job_id, status="success", found=len(candidates), new=new_count)
            print(f"[{store.name}] OK — {len(candidates)} ofertas ({new_count} produtos novos).")
        except Exception as e:  # noqa: BLE001
            total_failures += 1
            traceback.print_exc()
            pipeline.finish_job(job_id, status="failed", found=0, new=0, error=str(e)[:500])
            print(f"[{store.name}] FALHOU — {e}")

    return 1 if total_failures else 0


if __name__ == "__main__":
    sys.exit(run())
