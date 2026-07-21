"""Registro de scrapers por loja. A coluna `stores.scraper_key` no banco aponta
pra uma das chaves abaixo. Adicionar uma nova loja = escrever um módulo e
registrar aqui."""
from collections.abc import Callable

from ..models import Candidate
from . import clubedomalte

# scraper_key -> função scrape(listing_url) -> list[Candidate]
REGISTRY: dict[str, Callable[[str], list[Candidate]]] = {
    "clubedomalte": clubedomalte.scrape,
}


def get_scraper(scraper_key: str) -> Callable[[str], list[Candidate]] | None:
    return REGISTRY.get(scraper_key)
