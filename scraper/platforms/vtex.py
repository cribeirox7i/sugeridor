"""Coletor VTEX — portado do protótipo em Colab do usuário, adaptado pra usar
nossa sessão HTTP/rate-limit e o parser de preço robusto.

`store.site_url` deve ser a URL da API de busca do catálogo, ex:
  https://www.loja.com.br/api/catalog_system/pub/products/search/cervejas
(a mesma URL que o site usa internamente pra listar produtos — dá pra achar
abrindo a aba Rede do navegador na página de categoria). Paginação via
`_from`/`_to` é feita por este coletor; não inclua esses parâmetros na URL.

config (opcional):
  { "step": 24, "max_blocks": 200, "max_items": 200 }
"""
import re

from ..config import DEFAULT_MAX_ITEMS_PER_STORE
from ..extract import absolute_url, parse_available
from ..http import fetch_json
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from ..price import parse_price


def _strip_pagination(url: str) -> str:
    return re.sub(r"([?&])((page=\d+)|(_from=\d+&_to=\d+))", "", url).rstrip("?&")


def collect(store: StoreRecord) -> list[Candidate]:
    cfg = store.config or {}
    step = int(cfg.get("step", 24))
    max_blocks = int(cfg.get("max_blocks", 200))
    max_items = int(cfg.get("max_items", DEFAULT_MAX_ITEMS_PER_STORE))

    base = _strip_pagination(store.site_url)
    candidates: list[Candidate] = []

    for block in range(max_blocks):
        start, end = block * step, block * step + step - 1
        sep = "&" if "?" in base else "?"
        url = f"{base}{sep}_from={start}&_to={end}"

        try:
            data = fetch_json(url)
        except Exception as e:  # noqa: BLE001 — erro num bloco não deve jogar fora os anteriores
            print(f"  ! {store.name}: falha no bloco {block} ({e}) — parando aqui, mantendo o já coletado.")
            break
        if not data or not isinstance(data, list):
            break

        for item in data:
            offer = None
            try:
                offer = item["items"][0]["sellers"][0]["commertialOffer"]
                price = parse_price(offer.get("Price"))
            except (KeyError, IndexError, TypeError):
                price = None
            if price is None:
                continue

            # `AvailableQuantity` é o sinal primário do VTEX (0 = esgotado);
            # `IsAvailable` é o reserva pra quando a loja não expõe a
            # quantidade. Sem nenhum dos dois, `parse_available` assume
            # disponível.
            quantity = (offer or {}).get("AvailableQuantity")
            if isinstance(quantity, (int, float)):
                available = quantity > 0
            else:
                available = parse_available((offer or {}).get("IsAvailable"))

            image_url = None
            try:
                image_url = item["items"][0]["images"][0]["imageUrl"]
            except (KeyError, IndexError, TypeError):
                pass

            link_text = item.get("linkText")
            product_url = absolute_url(store.site_url, f"/{link_text}/p") if link_text else base

            name = clean_product_name(str(item.get("productName", "")).strip())
            attributes: dict = {}
            vol = parse_volume_ml(name)
            if vol:
                attributes["volume_ml"] = vol

            candidates.append(
                Candidate(
                    product_name=name,
                    brand=item.get("brand") or None,
                    price=price,
                    url=product_url or store.site_url,
                    image_url=absolute_url(store.site_url, image_url),
                    available=available,
                    attributes=attributes,
                )
            )
            if len(candidates) >= max_items:
                return candidates

        if len(data) < step:
            break  # último bloco

    return candidates
