"""Coletor HTML genérico via seletores CSS configuráveis. Diferente do
protótipo em Colab (que casava nome[i]/preço[i]/imagem[i] por índice — quebra
se a página tiver quantidades diferentes de cada elemento), este itera por um
seletor de CONTAINER do produto e busca cada campo relativo a ele. Mais lento
por request, mas não desalinha os dados.

config:
  {
    "item_selector": ".product-item",   # container de cada produto na listagem
    "name_selector": ".product-title",  # relativo ao container
    "price_selector": ".price",
    "image_selector": "img",
    "image_attr": "src",                # ou "data-src" se for lazy-load
    "link_selector": "a",
    "page_param": "page",               # opcional, se a listagem pagina por query string
    "max_pages": 1
  }
"""
from bs4 import BeautifulSoup
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from ..extract import absolute_url
from ..http import fetch
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from ..price import parse_price


def _page_url(listing_url: str, page: int, page_param: str) -> str:
    parts = urlparse(listing_url)
    q = parse_qs(parts.query)
    q[page_param] = [str(page)]
    new_q = urlencode({k: v[0] for k, v in q.items()})
    return urlunparse(parts._replace(query=new_q))


def _text_of(container, selector: str) -> str | None:
    if not selector:
        return None
    el = container.select_one(selector)
    return el.get_text(strip=True) if el else None


def collect(store: StoreRecord) -> list[Candidate]:
    cfg = store.config or {}
    item_sel = cfg.get("item_selector")
    if not item_sel:
        raise ValueError("config.item_selector é obrigatório para platform 'html'")

    name_sel = cfg.get("name_selector")
    price_sel = cfg.get("price_selector")
    image_sel = cfg.get("image_selector", "img")
    image_attr = cfg.get("image_attr", "src")
    link_sel = cfg.get("link_selector", "a")
    page_param = cfg.get("page_param")
    max_pages = int(cfg.get("max_pages", 1))

    candidates: list[Candidate] = []

    for page in range(1, max_pages + 1):
        url = _page_url(store.site_url, page, page_param) if page_param else store.site_url
        try:
            html_text = fetch(url)
        except Exception as e:  # noqa: BLE001 — erro numa página não deve jogar fora as anteriores
            print(f"  ! {store.name}: falha na página {page} ({e}) — parando aqui, mantendo o já coletado.")
            break
        soup = BeautifulSoup(html_text, "html.parser")
        items = soup.select(item_sel)
        if not items:
            break

        for item in items:
            raw_name = _text_of(item, name_sel)
            raw_price = _text_of(item, price_sel)
            price = parse_price(raw_price)
            if not raw_name or price is None:
                continue

            img = item.select_one(image_sel) if image_sel else None
            image_url = img.get(image_attr) if img else None

            link = item.select_one(link_sel) if link_sel else None
            href = link.get("href") if link else None

            name = clean_product_name(raw_name)
            attributes: dict = {}
            vol = parse_volume_ml(name)
            if vol:
                attributes["volume_ml"] = vol

            candidates.append(
                Candidate(
                    product_name=name,
                    price=price,
                    url=absolute_url(store.site_url, href) or store.site_url,
                    image_url=absolute_url(store.site_url, image_url),
                    attributes=attributes,
                )
            )

        if not page_param:
            break

    return candidates
