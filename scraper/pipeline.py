"""Consome candidatos e grava no banco: acha/cria produto, faz upsert da oferta
e registra o ponto de histórico de preço. Ver docs/04-conectores-ingestao.md."""
from datetime import datetime, timezone

from . import db
from .models import Candidate
from .normalize import slugify

_type_cache: dict[str, str] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def product_type_id(slug: str) -> str:
    if slug not in _type_cache:
        rows = db.select("product_types", {"slug": f"eq.{slug}", "select": "id"})
        if not rows:
            raise SystemExit(f"product_type '{slug}' não existe — rode a migration de seed.")
        _type_cache[slug] = rows[0]["id"]
    return _type_cache[slug]


def _candidate_slug(cand: Candidate) -> str:
    # Mesma fórmula de slug do admin (web): slugify(`${brand} ${name}`).
    return slugify(f"{cand.brand or ''} {cand.product_name}")


def process_candidate(cand: Candidate, store_id: str) -> bool:
    """Grava um candidato. Retorna True se criou um produto novo."""
    slug = _candidate_slug(cand)
    existing = db.select(
        "products", {"canonical_slug": f"eq.{slug}", "select": "id,image_url,attributes"}
    )

    if existing:
        product_id = existing[0]["id"]
        is_new = False
        patch: dict = {}

        # Backfill: produto já existia sem imagem (ex: criado antes do
        # coletor extrair `image` do JSON-LD) — completa sem sobrescrever
        # uma imagem já definida (que pode ter sido curada manualmente).
        if not existing[0].get("image_url") and cand.image_url:
            patch["image_url"] = cand.image_url

        # Idem pra atributos (ex: país/estilo passaram a ser extraídos depois
        # que o produto já tinha sido criado só com volume_ml) — só completa
        # as chaves que faltam, nunca sobrescreve o que já está lá.
        existing_attrs = dict(existing[0].get("attributes") or {})
        missing_attrs = {k: v for k, v in cand.attributes.items() if k not in existing_attrs}
        if missing_attrs:
            patch["attributes"] = {**existing_attrs, **missing_attrs}

        if patch:
            db.update("products", {"id": f"eq.{product_id}"}, patch)
    else:
        created = db.insert(
            "products",
            {
                "product_type_id": product_type_id(cand.product_type_slug),
                "name": cand.product_name,
                "brand": cand.brand,
                "attributes": cand.attributes,
                "image_url": cand.image_url,
                "canonical_slug": slug,
            },
        )
        product_id = created["id"]
        is_new = True

    now = _now()

    offer = db.upsert(
        "offers",
        {
            "product_id": product_id,
            "store_id": store_id,
            "price": cand.price,
            "currency": cand.currency,
            "url": cand.url,
            "source_type": "scrape",
            "active": cand.available,
            "last_seen_at": now,
            "updated_at": now,
        },
        on_conflict="product_id,store_id",
    )

    if offer:
        db.insert(
            "price_history",
            {"offer_id": offer["id"], "price": cand.price, "captured_at": now},
            returning=False,
        )

    return is_new


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
