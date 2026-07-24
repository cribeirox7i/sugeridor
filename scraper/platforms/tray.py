"""Coletor Tray Commerce — cascata em 3 tentativas (portado do protótipo em
Colab): 1) endpoint /web_api/products; 2) JSON embutido no HTML
(__PRELOADED_STATE__ / __NEXT_DATA__); 3) fallback grosseiro varrendo texto do
HTML. Cada etapa só roda se a anterior não achou nada com nome preenchido.

`store.site_url` pode ser qualquer URL da loja — só o domínio é usado.
"""
import json
import re

from bs4 import BeautifulSoup

from ..extract import absolute_url
from ..http import fetch, fetch_json
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from ..price import parse_price


def _base_url(site_url: str) -> str | None:
    m = re.match(r"https?://[^/]+", site_url)
    return m.group(0) if m else None


def _from_web_api(base_url: str) -> list[Candidate]:
    data = fetch_json(f"{base_url}/web_api/products?page=1")
    if not isinstance(data, dict):
        return []

    out: list[Candidate] = []
    for item in data.get("Products", []):
        p = item.get("Product", {})
        name = clean_product_name(str(p.get("name") or p.get("title") or "").strip())
        price = parse_price(p.get("data-sell-price") or p.get("price") or p.get("promotional_price"))
        if not name or price is None:
            continue
        url = p.get("url") or ""
        attributes: dict = {}
        vol = parse_volume_ml(name)
        if vol:
            attributes["volume_ml"] = vol
        out.append(
            Candidate(
                product_name=name,
                price=price,
                url=absolute_url(base_url, url) or base_url,
                image_url=absolute_url(base_url, p.get("featured_image")),
                attributes=attributes,
            )
        )
    return out


def _from_embedded_json(base_url: str, listing_url: str) -> list[Candidate]:
    html_text = fetch(listing_url)
    match = re.search(r"window\.__PRELOADED_STATE__\s*=\s*(\{.*?\})\s*;", html_text, re.DOTALL)
    if not match:
        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(\{.*?\})</script>', html_text, re.DOTALL)
    if not match:
        return []

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    raw_items: list[dict] = []
    for v in data.values():
        if isinstance(v, list):
            raw_items.extend(v)
        elif isinstance(v, dict):
            raw_items.extend(v.get("products", []))

    out: list[Candidate] = []
    for p in raw_items:
        name = clean_product_name(str(p.get("name") or p.get("title") or "").strip())
        if not name:
            continue
        price = parse_price(p.get("price") or p.get("promotional_price"))
        if price is None:
            continue
        attributes: dict = {}
        vol = parse_volume_ml(name)
        if vol:
            attributes["volume_ml"] = vol
        out.append(
            Candidate(
                product_name=name,
                price=price,
                url=absolute_url(base_url, p.get("url")) or base_url,
                image_url=absolute_url(base_url, p.get("image") or p.get("featured_image")),
                attributes=attributes,
            )
        )
    return out


def _fallback_html_scan(listing_url: str) -> list[Candidate]:
    """Último recurso: acha textos que parecem nome de produto no HTML cru.
    Sem preço/link confiáveis — melhor que nada, mas fica marcado como
    indisponível pra revisão manual no admin em vez de aparecer com preço 0."""
    soup = BeautifulSoup(fetch(listing_url), "html.parser")
    out: list[Candidate] = []
    seen: set[str] = set()
    for tag in soup.find_all(["a", "div"], string=True):
        text = tag.get_text(strip=True)
        if len(text) > 5 and re.search(r"cerveja", text, re.I) and text not in seen:
            seen.add(text)
            out.append(
                Candidate(product_name=clean_product_name(text), price=0.0, url=listing_url, available=False)
            )
    return out


def collect(store: StoreRecord) -> list[Candidate]:
    base_url = _base_url(store.site_url)
    if not base_url:
        return []

    candidates = _from_web_api(base_url)
    if not candidates:
        candidates = _from_embedded_json(base_url, store.site_url)
    if not candidates:
        candidates = _fallback_html_scan(store.site_url)

    # dedup por nome, preservando ordem
    seen_names: set[str] = set()
    unique = []
    for c in candidates:
        if c.product_name not in seen_names:
            seen_names.add(c.product_name)
            unique.append(c)
    return unique
