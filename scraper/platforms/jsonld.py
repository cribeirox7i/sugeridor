"""Coletor genérico para sites que publicam dados estruturados JSON-LD
(schema.org/Product) na página de produto — comum em plataformas brasileiras
como FBits, entre outras. Generaliza o scraper específico que fizemos pro
Clube do Malte: aqui, o que muda de loja pra loja fica na `config`, não em
código novo.

Estratégia: 1) pagina a listagem e coleta links de produto (via CSS selector);
2) abre cada produto e lê o bloco <script type="application/ld+json">.

config:
  {
    "link_selector": ".spot_container a",   # CSS selector dos links na listagem
    "url_contains": "/produto/",            # opcional: filtro extra do href
    "page_param": "pagina",                 # nome do parâmetro de página na URL
    "max_pages": 20,
    "max_items": 150
  }
"""
import json
import re

from bs4 import BeautifulSoup

from ..config import DEFAULT_MAX_ITEMS_PER_STORE
from ..extract import absolute_url
from ..http import fetch
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

# Nomes de atributo (como a plataforma FBits rotula) -> chave do nosso schema.
_FBITS_ATTR_MAP = {"País": "pais", "Estilo": "estilo", "Teor Alcoólico": "abv"}


def _extract_fbits_attributes(html_text: str) -> dict:
    """Melhor esforço: a plataforma FBits (usada pelo Clube do Malte, entre
    outras) embute um bloco JS `var _<id>=[[...]],productname` na página do
    produto com atributos estruturados (país, estilo, teor alcoólico...) que
    NÃO aparecem no JSON-LD. Não é uma API documentada — se a página não tiver
    esse padrão (site de outra plataforma), retorna vazio sem quebrar o resto
    do parse.
    """
    match = re.search(r'var _\d+=(\[\[.*?\]\])\s*,\s*productname', html_text, re.DOTALL)
    if not match:
        return {}

    pairs = re.findall(
        r'\{key:"name",value:"([^"]+)"\},\{key:"type",value:"[^"]*"\},\{key:"value",value:"([^"]+)"\}',
        match.group(1),
    )
    attributes: dict = {}
    for name, value in pairs:
        key = _FBITS_ATTR_MAP.get(name)
        if not key:
            continue
        if key == "abv":
            num = re.search(r"[\d,.]+", value)
            if num:
                try:
                    attributes[key] = float(num.group(0).replace(",", "."))
                except ValueError:
                    pass
        else:
            attributes[key] = value
    return attributes


def _page_url(listing_url: str, page: int, page_param: str) -> str:
    parts = urlparse(listing_url)
    q = parse_qs(parts.query)
    q[page_param] = [str(page)]
    new_q = urlencode({k: v[0] for k, v in q.items()})
    return urlunparse(parts._replace(query=new_q))


def _product_links(listing_html: str, base_url: str, link_selector: str, url_contains: str) -> list[str]:
    soup = BeautifulSoup(listing_html, "html.parser")
    links: list[str] = []
    for a in soup.select(link_selector):
        href = a.get("href") if a.name == "a" else (a.find("a") or {}).get("href")
        if href and (not url_contains or url_contains in href):
            resolved = absolute_url(base_url, href)
            if resolved:
                links.append(resolved)
    return list(dict.fromkeys(links))


def _first_image_url(image) -> str | None:
    """O campo `image` do schema.org Product varia de formato entre sites:
    string única, lista de strings, ou ImageObject ({"url": "..."}) — às vezes
    numa lista. Pega a primeira URL utilizável em qualquer um desses casos."""
    if isinstance(image, list):
        image = image[0] if image else None
    if isinstance(image, dict):
        image = image.get("url")
    return image if isinstance(image, str) and image else None


def _parse_product(html_text: str, fallback_url: str) -> Candidate | None:
    soup = BeautifulSoup(html_text, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            # strict=False tolera \n cru dentro de strings (ex: texto de reviews)
            data = json.loads(tag.string or "", strict=False)
        except (json.JSONDecodeError, TypeError):
            continue

        for obj in data if isinstance(data, list) else [data]:
            if not isinstance(obj, dict) or obj.get("@type") not in ("Product", "product"):
                continue

            offers = obj.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            price_raw = offers.get("price")
            if price_raw in (None, ""):
                continue
            try:
                price = float(str(price_raw).replace(",", "."))
            except ValueError:
                continue

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
            # Complementa com país/estilo/abv quando a plataforma expõe
            # (ver _extract_fbits_attributes) — não sobrescreve volume_ml.
            for k, v in _extract_fbits_attributes(html_text).items():
                attributes.setdefault(k, v)

            return Candidate(
                product_name=name,
                brand=brand or None,
                price=price,
                currency=offers.get("priceCurrency") or "BRL",
                url=offers.get("url") or fallback_url,
                image_url=absolute_url(fallback_url, _first_image_url(obj.get("image"))),
                available=available,
                attributes=attributes,
            )
    return None


def collect(store: StoreRecord) -> list[Candidate]:
    cfg = store.config or {}
    link_selector = cfg.get("link_selector", "a")
    url_contains = cfg.get("url_contains", "")
    page_param = cfg.get("page_param", "pagina")
    max_pages = int(cfg.get("max_pages", 20))
    max_items = int(cfg.get("max_items", DEFAULT_MAX_ITEMS_PER_STORE))

    seen_links: set[str] = set()
    candidates: list[Candidate] = []

    for page in range(1, max_pages + 1):
        if len(seen_links) >= max_items:
            break
        try:
            listing_html = fetch(_page_url(store.site_url, page, page_param))
        except Exception as e:  # noqa: BLE001 — erro numa página não deve jogar fora as anteriores
            print(f"  ! {store.name}: falha na página {page} ({e}) — parando aqui, mantendo o já coletado.")
            break
        links = [
            l
            for l in _product_links(listing_html, store.site_url, link_selector, url_contains)
            if l not in seen_links
        ]
        if not links:
            break
        # Corta aqui, antes de abrir cada página de produto (1 request cada)
        # — não faz sentido gastar requests com links que vão passar do teto.
        links = links[: max_items - len(seen_links)]
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
