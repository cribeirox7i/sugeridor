"""Helpers de extração compartilhados entre plataformas."""
from urllib.parse import urljoin


def absolute_url(base_url: str, maybe_relative: str | None) -> str | None:
    """Resolve uma URL relativa contra a base do site. Substitui o arrumar_img
    do Colab (que só tratava prefixo manual "http") por urljoin, que também
    resolve "//cdn.site.com/...", "../img.jpg", etc corretamente."""
    if not maybe_relative:
        return None
    return urljoin(base_url, maybe_relative.strip())
