"""Helpers de extração compartilhados entre plataformas."""
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
