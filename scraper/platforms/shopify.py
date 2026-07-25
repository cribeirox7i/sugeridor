"""Coletor Shopify — todo Shopify expõe um endpoint JSON público e não-oficial
`/products.json`, paginável por `?page=N`. Portado do protótipo em Colab.

`store.site_url` pode ser a home da loja, uma URL de coleção
(`/collections/<handle>`), ou já a URL do endpoint. Se apontar pra uma
coleção, o coletor usa o endpoint JSON *daquela coleção*
(`/collections/<handle>/products.json`) — Shopify também pagina esse
endpoint por `?page=N`, igual ao catálogo inteiro. Sem isso, uma loja
genérica (não 100% cerveja) traria todo o catálogo — foi o que aconteceu
com a Casa Flora (vinho, mercearia etc. junto com cerveja).

config (opcional): { "max_pages": 50 }
"""
import re

from ..extract import absolute_url
from ..http import fetch_json
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from ..price import parse_price


def _domain_of(site_url: str) -> str:
    m = re.match(r"https?://[^/]+", site_url)
    return m.group(0) if m else site_url.rstrip("/")


def _products_json_url(site_url: str) -> str:
    base = site_url.split("?")[0].rstrip("/")
    collection = re.search(r"/collections/([^/]+)", base)
    if collection:
        domain = base.split("/collections/")[0].rstrip("/")
        return f"{domain}/collections/{collection.group(1)}/products.json"
    base = base.split("/products.json")[0].rstrip("/")
    return f"{base}/products.json"


def collect(store: StoreRecord) -> list[Candidate]:
    cfg = store.config or {}
    max_pages = int(cfg.get("max_pages", 50))
    endpoint = _products_json_url(store.site_url)
    domain = _domain_of(store.site_url)

    candidates: list[Candidate] = []

    for page in range(1, max_pages + 1):
        data = fetch_json(f"{endpoint}?page={page}")
        if not data:
            break

        products = data.get("products") if isinstance(data, dict) else data
        if not products:
            break

        for p in products:
            variants = p.get("variants") or []
            price = parse_price(variants[0].get("price")) if variants else None
            if price is None:
                continue

            images = p.get("images") or []
            image_url = images[0].get("src") if images else None

            name = clean_product_name(str(p.get("title", "")).strip())
            attributes: dict = {}
            vol = parse_volume_ml(name)
            if vol:
                attributes["volume_ml"] = vol

            handle = p.get("handle", "")
            candidates.append(
                Candidate(
                    product_name=name,
                    brand=p.get("vendor") or None,
                    price=price,
                    url=f"{domain}/products/{handle}",
                    image_url=absolute_url(domain, image_url),
                    attributes=attributes,
                )
            )

        if len(products) == 0:
            break

    return candidates
