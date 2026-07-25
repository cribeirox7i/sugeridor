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
