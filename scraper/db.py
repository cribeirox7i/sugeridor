"""Cliente mínimo do Supabase via PostgREST (usando a service_role key, que
ignora RLS). Só requests — sem dependências pesadas."""
from typing import Any

import requests

from .config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


def _headers(extra: dict | None = None) -> dict:
    h = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _url(path: str) -> str:
    return f"{SUPABASE_URL}/rest/v1/{path}"


def select(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    r = requests.get(_url(table), headers=_headers(), params=params, timeout=20)
    r.raise_for_status()
    return r.json()


def insert(table: str, row: dict, *, returning: bool = True) -> dict | None:
    prefer = "return=representation" if returning else "return=minimal"
    r = requests.post(_url(table), headers=_headers({"Prefer": prefer}), json=row, timeout=20)
    r.raise_for_status()
    if returning and r.text:
        data = r.json()
        return data[0] if isinstance(data, list) and data else None
    return None


def update(table: str, params: dict[str, str], patch: dict) -> None:
    r = requests.patch(_url(table), headers=_headers({"Prefer": "return=minimal"}), params=params, json=patch, timeout=20)
    r.raise_for_status()


def upsert(table: str, row: dict, on_conflict: str) -> dict | None:
    """Insere ou atualiza em conflito de chave única, retornando a linha."""
    r = requests.post(
        _url(table),
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=representation"}),
        params={"on_conflict": on_conflict},
        json=row,
        timeout=20,
    )
    r.raise_for_status()
    data = r.json() if r.text else []
    return data[0] if isinstance(data, list) and data else None


# ── Operações em lote ─────────────────────────────────────────────
# O PostgREST aceita um array de linhas num único POST. Uma request por
# LOTE em vez de uma por produto é o que viabiliza 100+ lojas: antes eram 3
# round-trips por candidato (select do slug + upsert da oferta + insert do
# histórico), ou seja ~60 mil requests pra 100 lojas × 200 itens — só de
# latência isso estoura qualquer limite de tempo de job. Ver pipeline.py.
_BATCH_SIZE = 500


def _chunks(rows: list[dict], size: int = _BATCH_SIZE):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def insert_many(table: str, rows: list[dict], *, returning: bool = True) -> list[dict]:
    """Insere várias linhas em lotes. Devolve as linhas criadas (na ordem em
    que o banco as retornou) quando `returning`."""
    out: list[dict] = []
    prefer = "return=representation" if returning else "return=minimal"
    for batch in _chunks(rows):
        r = requests.post(
            _url(table), headers=_headers({"Prefer": prefer}), json=batch, timeout=60
        )
        r.raise_for_status()
        if returning and r.text:
            data = r.json()
            if isinstance(data, list):
                out.extend(data)
    return out


def update_by_id_many(table: str, patches: list[dict]) -> int:
    """Aplica patches PARCIAIS (um por linha, cada um com sua chave `id`).

    Por que não `upsert_many`: no PostgREST o upsert é um
    `INSERT ... ON CONFLICT DO UPDATE`, então a linha enviada precisa ser
    COMPLETA — um patch tipo {id, image_url} viola os NOT NULL de
    `products` (product_type_id, name, canonical_slug) e o banco devolve
    400. Aprendido na prática: a coleta quebrou em três lojas exatamente
    assim.

    Um PATCH por linha é inevitável aqui porque cada patch tem valores
    diferentes (PostgREST não aplica valores distintos num filtro só). Não é
    o gargalo que motivou o trabalho em lote: patch só acontece quando falta
    imagem/atributo num produto que já existe, o que é a minoria — o volume
    grande (produtos novos, ofertas, histórico) segue em lote de verdade."""
    for patch in patches:
        row = dict(patch)
        row_id = row.pop("id")
        update(table, {"id": f"eq.{row_id}"}, row)
    return len(patches)


def upsert_many(table: str, rows: list[dict], on_conflict: str) -> list[dict]:
    """Upsert de várias linhas em lotes, devolvendo as linhas resultantes.

    ATENÇÃO: o Postgres recusa o comando inteiro se a MESMA chave de conflito
    aparecer duas vezes no mesmo lote ("ON CONFLICT DO UPDATE command cannot
    affect row a second time") — o caller precisa deduplicar por
    `on_conflict` antes de chamar."""
    out: list[dict] = []
    for batch in _chunks(rows):
        r = requests.post(
            _url(table),
            headers=_headers({"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": on_conflict},
            json=batch,
            timeout=60,
        )
        r.raise_for_status()
        if r.text:
            data = r.json()
            if isinstance(data, list):
                out.extend(data)
    return out
