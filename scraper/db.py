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
