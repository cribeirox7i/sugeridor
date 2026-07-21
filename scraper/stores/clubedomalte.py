"""Scraper do Clube do Malte (plataforma FBits).

Estratégia:
1. Pagina a listagem (?pagina=N&tamanho=24) e coleta os links de produto dos
   cards `.spot_container` (o preço NÃO vem na listagem — é injetado via JS).
2. Para cada produto, busca a página de detalhe e lê o bloco JSON-LD
   (schema.org/Product), que traz nome, marca, preço, moeda e disponibilidade.
"""
import json
import re
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse

from bs4 import BeautifulSoup

from ..http import fetch
from ..models import Candidate
from ..normalize import clean_product_name, parse_volume_ml
from ..config import MAX_PAGES

BASE = "https://www.clubedomalte.com.br"


def _page_url(listing_url: str, page: int) -> str:
    """Reescreve o parâmetro `pagina` da URL de listagem mantendo o resto."""
    parts = urlparse(listing_url)
    q = parse_qs(parts.query)
    q["pagina"] = [str(page)]
    q.setdefault("tamanho", ["24"])
    new_q = urlencode({k: v[0] for k, v in q.items()})
    return urlunparse(parts._replace(query=new_q))


def _product_links(listing_html: str) -> list[str]:
    soup = BeautifulSoup(listing_html, "html.parser")
    links: list[str] = []
    for card in soup.select(".spot_container"):
        a = card.find("a", href=True)
        if a and "/produto/" in a["href"]:
            links.append(urljoin(BASE, a["href"]))
    # dedup preservando ordem
    return list(dict.fromkeys(links))


def _parse_product(html: str, url: str) -> Candidate | None:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            # strict=False tolera quebras de linha literais dentro de strings —
            # o site injeta texto de reviews com \n cru, que quebraria o parse.
            data = json.loads(tag.string or "", strict=False)
        except (json.JSONDecodeError, TypeError):
            continue
        # pode vir como lista de objetos
        candidates = data if isinstance(data, list) else [data]
        for obj in candidates:
            if not isinstance(obj, dict) or obj.get("@type") not in ("Product", "product"):
                continue
            offers = obj.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            price_raw = offers.get("price")
            if price_raw in (None, ""):
                return None
            try:
                price = float(str(price_raw).replace(",", "."))
            except ValueError:
                return None

            brand = obj.get("brand")
            if isinstance(brand, dict):
                brand = brand.get("name")

            name = clean_product_name(str(obj.get("name", "")).strip())
            availability = str(offers.get("availability", "")).lower()
            available = "instock" in availability or availability == ""

            attributes: dict = {}
            vol = parse_volume_ml(name)
            if vol:
                attributes["volume_ml"] = vol

            return Candidate(
                product_name=name,
                brand=brand or None,
                price=price,
                currency=offers.get("priceCurrency") or "BRL",
                url=offers.get("url") or url,
                available=available,
                attributes=attributes,
                product_type_slug="cerveja",
            )
    return None


def scrape(listing_url: str) -> list[Candidate]:
    """Coleta todos os produtos das páginas da listagem informada."""
    seen_links: set[str] = set()
    candidates: list[Candidate] = []

    for page in range(1, MAX_PAGES + 1):
        html = fetch(_page_url(listing_url, page))
        links = [l for l in _product_links(html) if l not in seen_links]
        if not links:
            break  # sem produtos novos = fim da paginação
        for link in links:
            seen_links.add(link)
            try:
                cand = _parse_product(fetch(link), link)
            except Exception as e:  # noqa: BLE001 — um produto ruim não derruba o resto
                print(f"  ! falha ao ler {link}: {e}")
                cand = None
            if cand:
                candidates.append(cand)

    return candidates
