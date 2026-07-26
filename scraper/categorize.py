"""Classificação heurística de `products.category` por palavra-chave no
nome — só roda na CRIAÇÃO do produto (pipeline.py nunca reclassifica um
produto já existente, mesmo espírito do backfill de attributes: não
sobrescrever o que já foi decidido).

Lojas de plataforma (Shopify /products.json, Tray, etc.) trazem o catálogo
inteiro, que costuma incluir camiseta, ingresso de evento, copo, kit etc.
junto com cerveja de verdade — ver docs/05-roadmap.md. 'cervejas' e 'kit'
aparecem no site público (PUBLIC_CATEGORIES em web/src/lib/queries.ts); as
demais ficam só armazenadas.

Mantém sincronia com o backfill SQL da migration 0009 (mesma lista de
termos e mesma ordem de prioridade) — se ajustar uma lista, ajustar a
outra também.
"""
import re

_EVENTOS = re.compile(r"\b(ingresso|convite|evento|workshop|confraria)\b", re.IGNORECASE)
# Kit checado antes de copo: "Kit Copo + Cerveja" é 'kit', não 'copo'.
_KIT = re.compile(r"\bkit\b", re.IGNORECASE)
# Copo/taça/caldereta viram uma categoria só ('copo').
_COPO = re.compile(r"\b(copo|ta[cç]a|caldereta)\b", re.IGNORECASE)
_SOUVENIRS = re.compile(
    r"\b(camiseta|camisa|bon[eé]|chap[eé]u|broche|sapato|chinelo|caneca|chaveiro|adesivo|squeeze|"
    r"moletom|growler|abridor|meia|sacola|bag|ecobag|canga|toalha|bandeira|balde|sombrinha)\b"
    r"|guarda[\s-]?sol",
    re.IGNORECASE,
)


def classify_category(product_name: str) -> str:
    if _EVENTOS.search(product_name):
        return "eventos"
    if _KIT.search(product_name):
        return "kit"
    if _COPO.search(product_name):
        return "copo"
    if _SOUVENIRS.search(product_name):
        return "souvenirs"
    return "cervejas"
