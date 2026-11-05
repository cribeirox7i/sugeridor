"""Coletor Mercado Livre — parse do HTML da vitrine pública da loja.

`store.site_url` deve ser a URL da loja do vendedor no ML:
    https://www.mercadolivre.com.br/loja/{nickname}

config (opcional, JSONB da loja no admin):
    max_items: int — teto de produtos (default: DEFAULT_MAX_ITEMS_PER_STORE)

POR QUE HTML E NÃO A API OFICIAL
A API do ML foi fechada pra leitura de catálogo de terceiros:
  - /sites/MLB/search?seller_id=...  → 403 com ou sem token
  - /items?ids=...                   → 401 sem token, 403 por item com token
    de client_credentials (só serve pros itens da própria conta)
  - lista.mercadolivre.com.br/...    → redireciona pra verificação de conta
A vitrine (/loja/{nickname}) é servida com os produtos no HTML, incluindo
preço, e é o único ponto de acesso público que restou.

LIMITE CONHECIDO: a vitrine expõe só os produtos em destaque (~10), não o
catálogo inteiro do vendedor, e não pagina (_Desde_N e ?page=N devolvem a
mesma página).
"""
import re

from bs4 import BeautifulSoup

from ..config import DEFAULT_MAX_ITEMS_PER_STORE
from ..http import fetch
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml


def _current_price(card) -> float | None:
    """Preço ATUAL do card.

    Em produto com desconto o card traz dois valores: o cheio num
    <s class="poly-price__previous"> e o promocional dentro de
    .poly-price__current. Sem o filtro, o primeiro match seria o preço cheio.
    """
    el = card.select_one(".poly-price__current .andes-money-amount__fraction")
    if el is None:
        for amount in card.select(".andes-money-amount"):
            if "poly-price__previous" in (amount.get("class") or []):
                continue
            el = amount.select_one(".andes-money-amount__fraction")
            if el:
                break
    if el is None:
        return None

    fraction = el.get_text(strip=True).replace(".", "")
    cents_el = el.find_next_sibling(class_="andes-money-amount__cents")
    cents = cents_el.get_text(strip=True) if cents_el else "00"
    try:
        return float(f"{fraction}.{cents}")
    except ValueError:
        return None


def _item_id(href: str) -> str | None:
    """ID do anúncio do vendedor.

    A href aponta pra página de catálogo (/p/MLB70061191) e carrega o anúncio
    específico em pdp_filters=item_id:MLB4903775151 — são IDs diferentes, e o
    do anúncio é o que identifica a oferta desta loja.
    """
    m = re.search(r"item_id%3A(MLB\d+)", href) or re.search(r"/(MLB\d+)", href)
    return m.group(1) if m else None


def collect(store: StoreRecord) -> list[Candidate]:
    cfg = store.config or {}
    max_items = int(cfg.get("max_items", DEFAULT_MAX_ITEMS_PER_STORE))

    soup = BeautifulSoup(fetch(store.site_url), "html.parser")
    cards = soup.select("div.poly-card")
    if not cards:
        raise RuntimeError(
            f"Nenhum produto encontrado no HTML da vitrine ({store.site_url}). "
            "Confirme que a URL é a loja do vendedor "
            "(https://www.mercadolivre.com.br/loja/nome-do-vendedor); se estiver "
            "certa, o ML pode ter mudado a marcação da vitrine."
        )

    candidates: list[Candidate] = []
    seen: set[str] = set()

    for card in cards:
        link = card.select_one("a.poly-component__title")
        if not link:
            continue
        href = link.get("href") or ""
        item_id = _item_id(href)
        if item_id and item_id in seen:
            continue

        price = _current_price(card)
        name = clean_product_name(link.get_text(strip=True))
        if price is None or not name:
            continue
        if item_id:
            seen.add(item_id)

        attributes: dict = {}
        vol = parse_volume_ml(name)
        if vol:
            attributes["volume_ml"] = vol

        img = card.select_one("img.poly-component__picture")

        candidates.append(
            Candidate(
                product_name=name,
                price=price,
                # Tudo depois do '#' é tracking da vitrine; o pdp_filters antes
                # dele é o que mantém o link no anúncio desta loja.
                url=href.split("#")[0] or store.site_url,
                image_url=img.get("src") if img else None,
                attributes=attributes,
            )
        )
        if len(candidates) >= max_items:
            break

    return candidates
