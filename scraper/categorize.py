"""Classificação heurística de `products.category` por palavra-chave no
nome — só roda na CRIAÇÃO do produto (pipeline.py nunca reclassifica um
produto já existente, mesmo espírito do backfill de attributes: não
sobrescrever o que já foi decidido).

Lojas de plataforma (Shopify /products.json, Tray, etc.) trazem o catálogo
inteiro, que costuma incluir camiseta, ingresso de evento, copo, kit etc.
junto com cerveja de verdade — ver docs/05-roadmap.md. 'cervejas' e 'kit'
aparecem no site público (PUBLIC_CATEGORIES em web/src/lib/queries.ts); as
demais ficam só armazenadas.

As palavras de cada categoria vêm da tabela `category_keywords` (migration
0011), editável em /admin/classificacao — carregadas do banco UMA VEZ por
execução (`load_keywords`, chamado por run.py antes de disparar os workers
paralelos) e cacheadas em memória, pra não haver 1 query por produto. A
ORDEM de prioridade das categorias continua fixa aqui no código (não é dado
editável): "Kit Copo + Cerveja" precisa virar 'kit', não 'copo', então kit é
checado antes. Se a leitura do banco falhar ou vier vazia (rede, migration
não rodou ainda), cai pras listas hardcoded abaixo como rede de segurança.
"""
import re
import threading

from . import db

_CATEGORY_ORDER = ["eventos", "kit", "copo", "souvenirs"]

# Rede de segurança: usado só se load_keywords() não for chamado (ex. testes
# isolados) ou se a leitura do banco falhar/vier vazia.
_FALLBACK_KEYWORDS = {
    "eventos": [
        "ingresso", "convite", "evento", "workshop", "confraria",
        "vale presente", "cartão presente", "cartao presente",
    ],
    "kit": ["kit"],
    "copo": ["copo", "taça", "taca", "caldereta"],
    "souvenirs": [
        "camiseta", "camisa", "boné", "bone", "chapéu", "chapeu", "broche", "sapato",
        "chinelo", "caneca", "chaveiro", "adesivo", "squeeze", "moletom", "growler",
        "abridor", "meia", "sacola", "bag", "ecobag", "canga", "toalha", "bandeira",
        "balde", "sombrinha", "guarda-sol", "guarda sol",
        # Achados no catálogo real depois (ver migration 0012): "moleton" com N
        # é como a loja escreve, e não casava com "moletom".
        "poster", "pôster", "pin", "tote", "gorro", "corta vento", "luminoso",
        "moleton", "cartela",
    ],
}

_patterns_lock = threading.Lock()
_patterns: dict[str, re.Pattern] | None = None


def _compile(keywords_by_category: dict[str, list[str]]) -> dict[str, re.Pattern]:
    compiled = {}
    for category, words in keywords_by_category.items():
        words = [w for w in words if w.strip()]
        if not words:
            continue
        alternation = "|".join(re.escape(w.strip()) for w in words)
        compiled[category] = re.compile(rf"\b(?:{alternation})\b", re.IGNORECASE)
    return compiled


def load_keywords() -> None:
    """Lê `category_keywords` do banco e monta os regex em memória. Chamado
    UMA VEZ por run.py, antes do ThreadPoolExecutor — depois disso só leitura,
    então dispensa lock entre workers (mesmo raciocínio de não precisar
    travar algo que não muda mais durante a execução)."""
    global _patterns
    try:
        rows = db.select("category_keywords", {"select": "category,keyword"})
    except Exception:  # noqa: BLE001 — rede/banco fora do ar não pode travar a coleta
        rows = []

    keywords_by_category: dict[str, list[str]] = {c: [] for c in _CATEGORY_ORDER}
    for row in rows:
        category = row.get("category")
        keyword = row.get("keyword")
        if category in keywords_by_category and keyword:
            keywords_by_category[category].append(keyword)

    if not rows or not any(keywords_by_category.values()):
        keywords_by_category = _FALLBACK_KEYWORDS

    with _patterns_lock:
        _patterns = _compile(keywords_by_category)


def _get_patterns() -> dict[str, re.Pattern]:
    with _patterns_lock:
        if _patterns is None:
            return _compile(_FALLBACK_KEYWORDS)
        return _patterns


def classify_category(product_name: str) -> str:
    patterns = _get_patterns()
    for category in _CATEGORY_ORDER:
        pattern = patterns.get(category)
        if pattern and pattern.search(product_name):
            return category
    return "cervejas"
