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
    seen_handles: set[str] = set()

    for page in range(1, max_pages + 1):
        try:
            data = fetch_json(f"{endpoint}?page={page}")
        except Exception as e:  # noqa: BLE001 — erro numa página não deve jogar fora as anteriores
            print(f"  ! {store.name}: falha na página {page} ({e}) — parando aqui, mantendo o já coletado.")
            break
        if not data:
            break

        products = data.get("products") if isinstance(data, dict) else data
        if not products:
            break

        # Alguns CDNs, pra página fora do intervalo real, devolvem de novo o
        # conteúdo da última página em vez de uma lista vazia — sem checar
        # isso, o loop ia até max_pages reprocessando o mesmo conteúdo
        # (visto na prática: coleção com 55 produtos virou 545 candidatos,
        # todos repetidos, e a coleta ficou bem mais lenta à toa).
        new_products = [p for p in products if p.get("handle") not in seen_handles]
        if not new_products:
            break

        for p in new_products:
            seen_handles.add(p.get("handle"))
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

    return candidates
