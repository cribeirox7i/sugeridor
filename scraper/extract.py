"""Helpers de extração compartilhados entre plataformas."""
import unicodedata
from urllib.parse import urljoin


def absolute_url(base_url: str, maybe_relative: str | None) -> str | None:
    """Resolve uma URL relativa contra a base do site. Substitui o arrumar_img
    do Colab (que só tratava prefixo manual "http") por urljoin, que também
    resolve "//cdn.site.com/...", "../img.jpg", etc corretamente."""
    # Alguns sites representam imagem/link como objeto (ex: {"url": "..."})
    # em vez de string crua — sem essa checagem, `.strip()` estourava
    # AttributeError e derrubava o coletor inteiro (visto na prática no
    # Tray). Não tenta adivinhar a URL dentro do dict; melhor não ter
    # imagem/link do que quebrar a coleta inteira.
    if not maybe_relative or not isinstance(maybe_relative, str):
        return None
    return urljoin(base_url, maybe_relative.strip())


# Códigos curtos: comparação EXATA. Casar por sufixo aqui seria errado —
# "10" termina com "0" e viraria "esgotado".
_EXACT_UNAVAILABLE = {"0", "false", "no", "n"}
_EXACT_AVAILABLE = {"1", "true", "yes", "y"}

# Palavras: comparação por SUFIXO, porque o schema.org manda a URL inteira
# ("https://schema.org/OutOfStock" → "httpsschemaorgoutofstock" depois de
# normalizar) e o Shopify usa "out_of_stock".
_SUFFIX_UNAVAILABLE = (
    "outofstock", "soldout", "backorder", "discontinued", "preorder",
    "esgotado", "indisponivel", "foradeestoque", "semestoque",
)
_SUFFIX_AVAILABLE = (
    "instock", "instoreonly", "limitedavailability", "onlineonly",
    "disponivel", "imediata", "emestoque",
)


def parse_available(value, default: bool = True) -> bool:
    """Interpreta o campo de disponibilidade de uma loja, que vem em formatos
    incompatíveis entre plataformas.

    O caso que justifica esta função existir: o Tray devolve `available` como a
    STRING "0"/"1", e `"0"` é *truthy* em Python — um `bool(value)` marcaria
    como disponível justamente o que está esgotado (9 de 30 produtos numa
    página real da Nono Bier). Mesma família do bug de link/imagem virem como
    objeto em vez de string (ver `absolute_url` acima).

    `default=True` quando o campo está ausente ou é irreconhecível: sem sinal,
    é melhor mostrar a oferta e deixar a expiração por `last_seen_at` cuidar do
    que esconder catálogo por um campo que a loja simplesmente não publica.
    """
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value > 0
    if not isinstance(value, str):
        return default

    # Sem acento: "Indisponível" tem que casar com "indisponivel" da lista, e
    # sem isso caía no default (= disponível), o oposto do certo.
    stripped = unicodedata.normalize("NFD", value)
    stripped = "".join(c for c in stripped if unicodedata.category(c) != "Mn")
    normalized = "".join(c for c in stripped.lower() if c.isalnum())
    if not normalized:
        return default

    if normalized in _EXACT_UNAVAILABLE:
        return False
    if normalized in _EXACT_AVAILABLE:
        return True

    # Indisponível ANTES de disponível: "indisponivel" termina com
    # "disponivel", então checar o positivo primeiro marcaria o esgotado como
    # disponível. Os dois laços separados são o que garante essa ordem.
    if any(normalized.endswith(word) for word in _SUFFIX_UNAVAILABLE):
        return False
    if any(normalized.endswith(word) for word in _SUFFIX_AVAILABLE):
        return True
    return default
