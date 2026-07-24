"""Registro de coletores por PLATAFORMA de e-commerce (não mais por loja
individual). Adicionar uma loja nova de uma plataforma já suportada não requer
código — só cadastrar no admin com `platform` + `config`. Só plataformas
realmente novas (ou sites fora do padrão) precisam de um módulo novo aqui.
"""
from collections.abc import Callable

from ..models import Candidate, StoreRecord
from . import vtex, shopify, tray, jsonld, html, txt

# platform -> collect(store) -> list[Candidate]
REGISTRY: dict[str, Callable[[StoreRecord], list[Candidate]]] = {
    "vtex": vtex.collect,
    "shopify": shopify.collect,
    "tray": tray.collect,
    "jsonld": jsonld.collect,
    "html": html.collect,
    "txt": txt.collect,
}


def get_collector(platform: str) -> Callable[[StoreRecord], list[Candidate]] | None:
    return REGISTRY.get(platform)
