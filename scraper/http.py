"""Sessão HTTP com User-Agent educado, rate limit e retries simples."""
import time
import requests

from .config import USER_AGENT, REQUEST_DELAY

_session: requests.Session | None = None
_last_request_at = 0.0


def get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"User-Agent": USER_AGENT})
    return _session


def fetch(url: str, *, retries: int = 2, timeout: int = 20) -> str:
    """GET com rate limit entre chamadas e retry em falha transitória."""
    global _last_request_at
    session = get_session()

    for attempt in range(retries + 1):
        # respeita o intervalo mínimo entre requests
        elapsed = time.monotonic() - _last_request_at
        if elapsed < REQUEST_DELAY:
            time.sleep(REQUEST_DELAY - elapsed)
        try:
            resp = session.get(url, timeout=timeout)
            _last_request_at = time.monotonic()
            resp.raise_for_status()
            return resp.text
        except requests.RequestException:
            _last_request_at = time.monotonic()
            if attempt == retries:
                raise
            time.sleep(1.5 * (attempt + 1))
    return ""  # inalcançável
