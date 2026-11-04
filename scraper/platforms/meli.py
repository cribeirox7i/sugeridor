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


def collect(store: StoreRecord) -> list[Candidate]:
    if not _CLIENT_ID or not _CLIENT_SECRET:
        raise RuntimeError(
            "ML_CLIENT_ID e ML_CLIENT_SECRET não configurados nos secrets do GitHub Actions. "
            f"CLIENT_ID={_CLIENT_ID!r} SECRET={'***' if _CLIENT_SECRET else repr(_CLIENT_SECRET)}"
        )

    cfg = store.config or {}
    max_items = int(cfg.get("max_items", DEFAULT_MAX_ITEMS_PER_STORE))
    category_id = str(cfg.get("category_id", "")).strip()

    seller_id = str(cfg.get("seller_id", "")).strip()
    if not seller_id:
        seller_id = _resolve_seller_id(store.site_url)
    print(f"  ML [{store.name}]: seller_id={seller_id}")

    candidates: list[Candidate] = []
    limit = 50
    offset = 0

    while len(candidates) < max_items:
        path = f"/sites/MLB/search?seller_id={seller_id}&limit={limit}&offset={offset}"
        if category_id:
            path += f"&category={category_id}"

        try:
            data = _get(path)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {store.name}: falha na página offset={offset} ({e}) — parando aqui, mantendo o já coletado.")
            break

        paging = data.get("paging", {})
        results = data.get("results", [])
        if offset == 0:
            print(f"  ML [{store.name}]: total={paging.get('total', '?')} resultados, primeiro lote={len(results)}")
        if not results:
            break

        for item in results:
            price = parse_price(item.get("price"))
            if not price:
                continue

            name = clean_product_name(str(item.get("title", "")).strip())
            attributes: dict = {}
            vol = parse_volume_ml(name)
            if vol:
                attributes["volume_ml"] = vol

            available = int(item.get("available_quantity", 0)) > 0

            # ML retorna thumbnail com sufixo -I (190x190); -O é a versão original
            thumbnail = item.get("thumbnail") or ""
            image_url = thumbnail.replace("-I.jpg", "-O.jpg") if thumbnail else None

            candidates.append(
                Candidate(
                    product_name=name,
                    price=price,
                    url=item.get("permalink", ""),
                    image_url=image_url,
                    available=available,
                    attributes=attributes,
                )
            )
            if len(candidates) >= max_items:
                return candidates

        offset += len(results)
        if offset >= paging.get("total", 0):
            break

    return candidates
