"""Coletor Mercado Livre — API oficial (client_credentials, sem login de usuário).

`store.site_url` deve ser a URL da loja do vendedor no ML:
    https://www.mercadolivre.com.br/loja/{nickname}

config (opcional, JSONB da loja no admin):
    seller_id:   str — id numérico do vendedor (evita o lookup por nickname;
                       recomendado cadastrar após a primeira coleta bem-sucedida)
    category_id: str — filtra por categoria ML (ex: "MLB174" pra cervejas);
                       sem filtro coleta TUDO do vendedor e o pipeline filtra
                       por palavra-chave (categorize.py) como nas outras lojas
    max_items:   int — teto de produtos (default: DEFAULT_MAX_ITEMS_PER_STORE)

Credenciais (GitHub Actions secrets):
    ML_CLIENT_ID, ML_CLIENT_SECRET
"""
import os
import re
import time
from threading import Lock

import requests as _requests

from ..config import DEFAULT_MAX_ITEMS_PER_STORE
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from ..price import parse_price

_CLIENT_ID = os.environ.get("ML_CLIENT_ID", "")
_CLIENT_SECRET = os.environ.get("ML_CLIENT_SECRET", "")
_API = "https://api.mercadolibre.com"

_token_lock = Lock()
_token_cache: dict = {}


def _get_token() -> str:
    with _token_lock:
        now = time.monotonic()
        if _token_cache.get("token") and _token_cache.get("exp", 0) > now + 60:
            return _token_cache["token"]
        resp = _requests.post(
            f"{_API}/oauth/token",
            data={
                "grant_type": "client_credentials",
                "client_id": _CLIENT_ID,
                "client_secret": _CLIENT_SECRET,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        _token_cache["token"] = data["access_token"]
        _token_cache["exp"] = now + int(data.get("expires_in", 21600))
        return _token_cache["token"]


def _get(path: str) -> dict:
    resp = _requests.get(
        f"{_API}{path}",
        headers={"Authorization": f"Bearer {_get_token()}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()



def _resolve_seller_id_from_page(nickname: str) -> str | None:
    """Fallback: busca seller_id no HTML da página pública da loja.

    /users/search requer token de usuário (authorization_code), não funciona com
    client_credentials desde meados de 2025. A página da loja é pública e embute o
    seller_id no JSON do Next.js (__NEXT_DATA__ ou script inline).
    """
    try:
        url = f"https://www.mercadolivre.com.br/loja/{nickname}"
        resp = _requests.get(
            url,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (compatible; Sugeridor/1.0)"},
            allow_redirects=True,
        )
        if resp.status_code != 200:
            return None
        text = resp.text
        for pattern in [
            r'"sellerId"\s*:\s*"?(\d+)"?',
            r'"seller_id"\s*:\s*"?(\d+)"?',
            r'"id"\s*:\s*(\d+)\s*,\s*"nickname"\s*:\s*"' + re.escape(nickname) + '"',
            r'"nickname"\s*:\s*"' + re.escape(nickname) + r'"[^}]*?"id"\s*:\s*(\d+)',
        ]:
            m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if m:
                return m.group(1)
    except Exception:
        pass
    return None


def _resolve_seller_id(site_url: str) -> str:
    """Extrai nickname da URL e resolve o seller_id.

    Tenta /users/search primeiro; faz fallback para scraping da página pública da
    loja caso o endpoint retorne 403 (exige token de usuário com client_credentials).
    """
    m = re.search(r"/loja/([^/?#]+)", site_url, re.IGNORECASE)
    if not m:
        raise ValueError(f"Não foi possível extrair nickname de loja de '{site_url}'.")
    nickname = m.group(1)

    try:
        data = _get(f"/users/search?nickname={nickname}")
        results = data if isinstance(data, list) else data.get("results", [])
        if results:
            seller_id = str(results[0]["id"])
            print(
                f"  ML: nickname '{nickname}' → seller_id {seller_id} "
                f"(dica: salve em config.seller_id pra evitar esse lookup)"
            )
            return seller_id
    except Exception as exc:
        print(f"  ML: /users/search falhou ({exc}) — tentando fallback via página da loja...")

    seller_id = _resolve_seller_id_from_page(nickname)
    if seller_id:
        print(
            f"  ML: nickname '{nickname}' → seller_id {seller_id} "
            f"(via página pública; salve em config.seller_id pra evitar esse lookup)"
        )
        return seller_id

    raise ValueError(
        f"Não foi possível resolver seller_id para '{nickname}'. "
        "Cadastre o seller_id manualmente em config da loja no admin "
        "(abra qualquer produto da loja no ML e procure o número do vendedor na URL ou na API)."
    )


def _fetch_store_page_ids(site_url: str) -> list[str]:
    """Extrai IDs de itens MLB do HTML inicial (SSR) da página pública da loja.

    A API de busca /sites/MLB/search?seller_id=... exige token de usuário
    (authorization_code) — não funciona com client_credentials. Como alternativa,
    a página pública da loja embarca os IDs dos itens em destaque no HTML SSR do
    Next.js, sem precisar de auth. Os IDs são então buscados via /items?ids=...
    com nosso token de app (que SÍ funciona para leitura de itens públicos).
    """
    try:
        resp = _requests.get(
            site_url,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (compatible; Sugeridor/1.0)"},
            allow_redirects=True,
        )
        if resp.status_code != 200:
            print(f"  ML: página da loja retornou {resp.status_code}")
            return []
        # IDs de item ML: MLB + 8+ dígitos. IDs de categoria são menores (ex: MLB174).
        ids = list(dict.fromkeys(re.findall(r"MLB\d{8,}", resp.text)))
        return ids
    except Exception as e:
        print(f"  ML: falha ao buscar HTML da loja ({e})")
        return []


def _candidate_from_item(item: dict) -> "Candidate | None":
    price = parse_price(item.get("price"))
    if not price:
        return None
    name = clean_product_name(str(item.get("title", "")).strip())
    if not name:
        return None
    attributes: dict = {}
    vol = parse_volume_ml(name)
    if vol:
        attributes["volume_ml"] = vol
    available = int(item.get("available_quantity", 0)) > 0
    thumbnail = item.get("thumbnail") or ""
    image_url = thumbnail.replace("-I.jpg", "-O.jpg") if thumbnail else None
    return Candidate(
        product_name=name,
        price=price,
        url=item.get("permalink", ""),
        image_url=image_url,
        available=available,
        attributes=attributes,
    )


def collect(store: StoreRecord) -> list[Candidate]:
    """Coleta produtos da loja do vendedor no Mercado Livre.

    Estratégia (a API de search por seller_id exige auth de usuário):
    1. Busca o HTML SSR da página pública da loja → extrai IDs de itens MLB
    2. Chama GET /items?ids=... com nosso token de app → obtém título/preço/etc.
    """
    if not _CLIENT_ID or not _CLIENT_SECRET:
        raise RuntimeError(
            "ML_CLIENT_ID e ML_CLIENT_SECRET não configurados nos secrets do GitHub Actions. "
            f"CLIENT_ID={_CLIENT_ID!r} SECRET={'***' if _CLIENT_SECRET else repr(_CLIENT_SECRET)}"
        )

    cfg = store.config or {}
    max_items = int(cfg.get("max_items", DEFAULT_MAX_ITEMS_PER_STORE))

    # 1. Extrair IDs de itens do HTML SSR da loja
    item_ids = _fetch_store_page_ids(store.site_url)
    if not item_ids:
        raise RuntimeError(
            f"Nenhum ID de produto encontrado no HTML da loja ({store.site_url}). "
            "Verifique se a URL é a página da loja do vendedor no ML "
            "(ex: https://www.mercadolivre.com.br/loja/nome-do-vendedor)."
        )
    print(f"  ML [{store.name}]: {len(item_ids)} IDs no HTML → buscando detalhes via /items")

    # 2. Buscar detalhes em lotes de 20 via /items?ids=...
    candidates: list[Candidate] = []
    batch_errors: list[str] = []
    batch_size = 20
    attrs = "id,title,price,thumbnail,permalink,available_quantity"

    for i in range(0, min(len(item_ids), max_items), batch_size):
        if len(candidates) >= max_items:
            break
        batch = item_ids[i : i + batch_size]
        ids_str = ",".join(batch)
        try:
            items_data = _get(f"/items?ids={ids_str}&attributes={attrs}")
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            print(f"  ! ML [{store.name}]: falha ao buscar lote {i // batch_size + 1}: {msg}")
            batch_errors.append(msg)
            continue

        # /items?ids= retorna [{code, body}, ...] ou diretamente [...items...]
        rows = items_data if isinstance(items_data, list) else [items_data]
        print(f"  ML [{store.name}]: lote {i // batch_size + 1} → {len(rows)} rows, tipos: {[type(r).__name__ for r in rows[:3]]}")
        for row in rows:
            if isinstance(row, dict) and "body" in row:
                code = row.get("code", 200)
                if code != 200:
                    print(f"    item {row.get('id','?')}: code={code}")
                    continue
                item = row["body"]
            elif isinstance(row, dict) and "id" in row:
                item = row
            else:
                print(f"    row inesperado: {str(row)[:100]}")
                continue
            cand = _candidate_from_item(item)
            if cand:
                candidates.append(cand)
                if len(candidates) >= max_items:
                    break

    if batch_errors and not candidates:
        raise RuntimeError(
            f"Todos os lotes de /items falharam. Primeiro erro: {batch_errors[0]}"
        )

    return candidates
