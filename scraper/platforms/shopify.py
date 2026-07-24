"""Coletor Shopify — todo Shopify expõe um endpoint JSON público e não-oficial
`/products.json`, paginável por `?page=N`. Portado do protótipo em Colab.

`store.site_url` pode ser a home da loja, uma URL de coleção, ou já a URL do
endpoint — o coletor normaliza pra `<domínio>/products.json`.

config (opcional): { "max_pages": 50 }
"""
from ..extract import absolute_url
from ..http import fetch_json
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from ..price import parse_price


def _products_json_url(site_url: str) -> str:
    base = site_url.split("/collections/")[0].split("/products.json")[0].rstrip("/")
    return f"{base}/products.json"


def collect(store: StoreRecord) -> list[Candidate]:
    cfg = store.config or {}
    max_pages = int(cfg.get("max_pages", 50))
    endpoint = _products_json_url(store.site_url)
    domain = endpoint.replace("/products.json", "")

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
