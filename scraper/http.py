"""Sessão HTTP com User-Agent educado, rate limit por host e retries simples.

O rate limit é por HOST (não global) — antes uma única variável de módulo
compartilhada serializava requests pra QUALQUER site, então coletar 6 lojas em
domínios diferentes custava a soma do tempo de todas (~30min pra ~1400
ofertas). Por host mantém o mesmo intervalo educado dentro do mesmo site, mas
deixa lojas diferentes serem coletadas em paralelo (ver run.py) sem se
atrapalharem."""
import json
import threading
import time
from urllib.parse import urlparse

import requests

from .config import USER_AGENT, REQUEST_DELAY

_thread_local = threading.local()
_host_locks: dict[str, threading.Lock] = {}
_host_locks_guard = threading.Lock()
_last_request_at: dict[str, float] = {}


def _session() -> requests.Session:
    # Uma Session por thread: requests.Session não é garantidamente
    # thread-safe pra uso concorrente da mesma instância.
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT})
        _thread_local.session = session
    return session


def _host_lock(host: str) -> threading.Lock:
    with _host_locks_guard:
        lock = _host_locks.get(host)
        if lock is None:
            lock = threading.Lock()
            _host_locks[host] = lock
        return lock


def _throttled_get(url: str, *, retries: int, timeout: int) -> requests.Response:
    """GET com rate limit por host entre chamadas e retry em falha transitória."""
    host = urlparse(url).netloc
    lock = _host_lock(host)
    session = _session()

    for attempt in range(retries + 1):
        with lock:
            elapsed = time.monotonic() - _last_request_at.get(host, 0.0)
            if elapsed < REQUEST_DELAY:
                time.sleep(REQUEST_DELAY - elapsed)
            try:
                resp = session.get(url, timeout=timeout)
                _last_request_at[host] = time.monotonic()
                resp.raise_for_status()
                return resp
            except requests.RequestException:
                _last_request_at[host] = time.monotonic()
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
