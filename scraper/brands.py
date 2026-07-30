"""Catálogo normalizado de marcas (tabelas `brands`/`brand_aliases`,
migration 0021) — nome canônico + país, editável em `/admin/marcas`.
Substitui o de/para (`text_replacements`) como autoridade sobre
`products.brand`: uma marca cadastrada aqui vence o texto que a fonte trouxe.

Cacheado em memória (mesmo padrão de `categorize.load_keywords`): 1 leitura
por execução do scraper, não 1 query por produto. Só pra loja NÃO própria —
loja 'propria' já tem marca/país por autoridade da própria loja (ver
pipeline.py::_resolve_identity), as duas autoridades não disputam o mesmo
produto.
"""
import threading

from . import db
from .normalize import _fold

_lock = threading.Lock()
_by_alias: dict[str, tuple[str, str | None]] | None = None


def load_brands() -> None:
    """Lê `brands`+`brand_aliases` do banco e monta o mapa fold(alias) ->
    (nome canônico, país) em memória. Chamado UMA VEZ por run.py, antes do
    ThreadPoolExecutor — mesmo motivo de categorize.load_keywords: depois
    disso é só leitura, então workers em paralelo não precisam de lock."""
    global _by_alias
    try:
        brands = db.select("brands", {"select": "id,name,country"})
        aliases = db.select("brand_aliases", {"select": "brand_id,alias"})
    except Exception:  # noqa: BLE001 — rede/banco fora do ar não pode travar a coleta
        brands, aliases = [], []

    by_id = {b["id"]: (b["name"], b.get("country")) for b in brands}
    mapping: dict[str, tuple[str, str | None]] = {}
    # A marca em si também entra como "alias de si mesma" — cadastrar
    # "Paulaner" com o nome já grafado igual ao que alguma loja usa deve
    # bater, sem precisar duplicar como alias explícito.
    for b in brands:
        mapping[_fold(b["name"])] = (b["name"], b.get("country"))
    for a in aliases:
        target = by_id.get(a["brand_id"])
        if target:
            mapping[_fold(a["alias"])] = target

    with _lock:
        _by_alias = mapping


def lookup_brand(raw_brand: str | None) -> tuple[str, str | None] | None:
    """Marca canônica + país pra um texto de marca da fonte, via fold
    (minúsculas, sem acento/pontuação — mesma função usada pra comparar marca
    no nome em `normalize.name_contains_brand`). None = não achou nada
    cadastrado — o candidato segue com o que a fonte trouxe, comportamento de
    antes desta migration."""
    if not raw_brand:
        return None
    with _lock:
        mapping = _by_alias or {}
    return mapping.get(_fold(raw_brand))
