"""Sessão HTTP com User-Agent educado, rate limit e retries simples."""
import json
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


def _throttled_get(url: str, *, retries: int, timeout: int) -> requests.Response:
    """GET com rate limit entre chamadas e retry em falha transitória."""
    global _last_request_at
    session = get_session()

    for attempt in range(retries + 1):
        elapsed = time.monotonic() - _last_request_at
        if elapsed < REQUEST_DELAY:
            time.sleep(REQUEST_DELAY - elapsed)
        try:
            resp = session.get(url, timeout=timeout)
            _last_request_at = time.monotonic()
            resp.raise_for_status()
            return resp
        except requests.RequestException:
            _last_request_at = time.monotonic()
            if attempt == retries:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise AssertionError("inalcançável")  # o loop sempre retorna ou levanta


def fetch(url: str, *, retries: int = 2, timeout: int = 20) -> str:
    """GET retornando o corpo como texto."""
    return _throttled_get(url, retries=retries, timeout=timeout).text


def fetch_json(url: str, *, retries: int = 2, timeout: int = 20):
    """GET com parse de JSON tolerante — trata resposta comprimida (brotli) que
    o requests às vezes não descomprime sozinho, e corpo malformado. Retorna
    None se não conseguir parsear (em vez de lançar), pra o caller decidir
    parar a paginação sem derrubar o job inteiro."""
    resp = _throttled_get(url, retries=retries, timeout=timeout)
    try:
        return resp.json()
    except (ValueError, json.JSONDecodeError):
        pass
    try:
        import brotli  # import tardio: só é necessário nesse fallback raro

        return json.loads(brotli.decompress(resp.content).decode("utf-8"))
    except Exception:
        try:
            return json.loads(resp.text)
        except (ValueError, json.JSONDecodeError):
            return None
