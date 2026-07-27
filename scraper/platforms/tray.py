"""Coletor Tray Commerce — cascata em 3 tentativas (portado do protótipo em
Colab): 1) endpoint /web_api/products; 2) JSON embutido no HTML
(__PRELOADED_STATE__ / __NEXT_DATA__); 3) fallback grosseiro varrendo texto do
HTML. Cada etapa só roda se a anterior não achou nada com nome preenchido.

`store.site_url` pode ser qualquer URL da loja — só o domínio é usado.
"""
import json
import re

from bs4 import BeautifulSoup

from ..config import DEFAULT_MAX_ITEMS_PER_STORE
from ..extract import absolute_url
from ..http import fetch, fetch_json
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from ..price import parse_price


# Teto de páginas do /web_api — salvaguarda contra API que nunca sinaliza fim
# (o corte real é `max_items`, que vem da config da loja).
_MAX_API_PAGES = 100


def _base_url(site_url: str) -> str | None:
    m = re.match(r"https?://[^/]+", site_url)
    return m.group(0) if m else None


def _tray_link(value) -> str | None:
    """URL de um campo do Tray, que pode ser string ou objeto.

    O /web_api entrega link e imagem como `{"http": "...", "https": "..."}`,
    não como string — e o coletor lia direto, então caía no fallback e TODA
    oferta da loja apontava pra home em vez da página do produto, e nenhuma
    imagem era gravada. Prefere https."""
    if isinstance(value, str):
        return value or None
    if isinstance(value, dict):
        link = value.get("https") or value.get("http")
        return link if isinstance(link, str) and link else None
    return None


def _tray_image(product: dict) -> str | None:
    """Primeira imagem do produto. O Tray usa `ProductImage` (lista de objetos
    com http/https/thumbs); `featured_image`, que o coletor procurava antes,
    não existe nessa API."""
    images = product.get("ProductImage")
    if isinstance(images, list) and images:
        return _tray_link(images[0])
    # Formatos alternativos vistos em outras lojas Tray.
    return _tray_link(product.get("featured_image") or product.get("image"))


def _tray_price(product: dict) -> float | None:
    """Preço a exibir: o promocional quando existe (é o que a loja cobra),
    senão o cheio. O Tray manda `promotional_price: "0"` quando não há
    promoção, daí o teste por valor e não por presença."""
    promo = parse_price(product.get("promotional_price"))
    if promo is not None and promo > 0:
        return promo
    return parse_price(product.get("data-sell-price") or product.get("price"))


def _from_web_api(base_url: str, max_items: int) -> list[Candidate]:
    """Percorre o /web_api/products paginando.

    Buscar só `page=1` trazia 30 de 988 produtos numa loja real (Nono Bier) —
    a API informa o total e o tamanho de página em `paging`, e é isso que
    limita, não o catálogo."""
    out: list[Candidate] = []
    page = 1

    while len(out) < max_items and page <= _MAX_API_PAGES:
        data = fetch_json(f"{base_url}/web_api/products?page={page}")
        if not isinstance(data, dict):
            break
        products = data.get("Products") or []
        if not products:
            break

        for item in products:
            p = item.get("Product", {})
            name = clean_product_name(str(p.get("name") or p.get("title") or "").strip())
            price = _tray_price(p)
            if not name or price is None:
                continue
            attributes: dict = {}
            vol = parse_volume_ml(name)
            if vol:
                attributes["volume_ml"] = vol
            out.append(
                Candidate(
                    product_name=name,
                    brand=p.get("brand") or None,
                    price=price,
                    url=absolute_url(base_url, _tray_link(p.get("url"))) or base_url,
                    image_url=absolute_url(base_url, _tray_image(p)),
                    attributes=attributes,
                )
            )
            if len(out) >= max_items:
                break

        # `paging` diz quantas páginas existem; sem ele, para quando a página
        # vier menor que o limite informado.
        paging = data.get("paging") or {}
        total = paging.get("total")
        limit = paging.get("limit") or len(products)
        if isinstance(total, int) and limit and page * limit >= total:
            break
        if len(products) < (limit or 1):
            break
        page += 1

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


def _try_tier(fn, *args) -> list[Candidate]:
    # Uma falha (erro de rede, 403/503, etc.) numa etapa da cascata não pode
    # impedir a próxima de ser tentada — antes, uma exceção aqui matava
    # `collect()` inteiro antes mesmo de chegar no fallback de HTML.
    try:
        return fn(*args)
    except Exception as e:  # noqa: BLE001
        print(f"  ! {fn.__name__} falhou: {e}")
        return []


def collect(store: StoreRecord) -> list[Candidate]:
    base_url = _base_url(store.site_url)
    if not base_url:
        return []

    cfg = store.config or {}
    max_items = int(cfg.get("max_items", DEFAULT_MAX_ITEMS_PER_STORE))

    candidates = _try_tier(_from_web_api, base_url, max_items)
    if not candidates:
        candidates = _try_tier(_from_embedded_json, base_url, store.site_url)
    if not candidates:
        candidates = _try_tier(_fallback_html_scan, store.site_url)

    # dedup por nome, preservando ordem
    seen_names: set[str] = set()
    unique = []
    for c in candidates:
        if c.product_name not in seen_names:
            seen_names.add(c.product_name)
            unique.append(c)
    return unique[:max_items]
