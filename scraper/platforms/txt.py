"""Coletor posicional (find-based) — último recurso pra sites cuja estrutura
não dá pra pegar com CSS selector nem tem API. Portado do protótipo em Colab,
generalizado pra N campos (o original tinha 4 fixos, com um bug de
encadeamento: o campo 4 buscava a partir da posição do campo 2 em vez do
campo 3 — corrigido aqui).

Cada "campo" é: acha `tag` a partir da posição atual, depois `ini` a partir da
tag, depois `fim` a partir do `ini`; o texto entre `ini` e `fim` é o valor. O
primeiro campo é obrigatório (ele que delimita onde cada "produto" começa); os
demais são opcionais.

config:
  {
    "fields": [
      {"tag": "...", "ini": "...", "fim": "...", "tipo": "NOM"},
      {"tag": "...", "ini": "...", "fim": "...", "tipo": "PRC"},
      {"tag": "...", "ini": "...", "fim": "...", "tipo": "IMG"},
      {"tag": "...", "ini": "...", "fim": "...", "tipo": "URL"},
      {"tag": "...", "ini": "...", "fim": "...", "tipo": "MARCA"},
      {"tag": "...", "ini": "...", "fim": "...", "tipo": "PAIS"},
      {"tag": "...", "ini": "...", "fim": "...", "tipo": "ESTILO"}
    ],
    "max_items": 200
  }
tipo: NOM (nome), PRC (preço), IMG (imagem), URL (link do produto), MARCA
(marca), PAIS (attributes.pais), ESTILO (attributes.estilo). Esse `fields`
normalmente não é escrito à mão — a tela "Detectar campos" em /admin/lojas
(loja com platform=txt) deriva ele automaticamente a partir de um produto de
exemplo (ver web/src/lib/detectTxtFields.ts).

MARCA/PAIS são ignorados na prática para loja `store_type='propria'`: nesse
caso `pipeline.py::_resolve_identity` sempre sobrescreve `brand`/`attributes.
pais` pelo apelido/país da PRÓPRIA loja, então o valor lido aqui nunca chega a
valer. Configurá-los mesmo assim não quebra nada — só é redundante.
"""
import html as htmllib

from ..config import DEFAULT_MAX_ITEMS_PER_STORE
from ..extract import absolute_url
from ..http import fetch
from ..models import Candidate, StoreRecord
from ..normalize import clean_product_name, parse_volume_ml
from ..price import parse_price


def collect(store: StoreRecord) -> list[Candidate]:
    cfg = store.config or {}
    fields = cfg.get("fields") or []
    if not fields:
        raise ValueError("config.fields é obrigatório para platform 'txt'")
    max_items = int(cfg.get("max_items", DEFAULT_MAX_ITEMS_PER_STORE))

    text = htmllib.unescape(fetch(store.site_url))

    candidates: list[Candidate] = []
    pos = 0
    count = 0

    while pos < len(text) and count < max_items:
        values: dict[str, str] = {}
        anchor_pos = None
        last_fim = -1
        search_from = pos

        for i, f in enumerate(fields):
            pos_tag = text.find(f["tag"], search_from)
            if i == 0:
                if pos_tag == -1:
                    return candidates  # sem mais âncoras: fim da coleta
                anchor_pos = pos_tag

            pos_ini = text.find(f["ini"], pos_tag) if pos_tag != -1 else -1
            # Busca o `fim` a partir do FINAL de `ini` (não do início dele).
            # Buscar a partir de `pos_ini` (como o protótipo original em
            # Colab fazia) quebra sempre que `ini` termina com o mesmo
            # caractere que `fim` — ex.: ini=`src="` e fim=`"` fazem o
            # `find` achar a própria aspa de dentro de `ini`, e o valor
            # extraído sai vazio. Sem loja alguma em produção usando
            # platform='txt' hoje, não há config existente que dependa do
            # comportamento antigo.
            pos_fim = text.find(f["fim"], pos_ini + len(f["ini"])) if pos_ini != -1 else -1

            if pos_ini == -1 or pos_fim == -1:
                if i == 0:
                    return candidates  # campo âncora não encontrado: fim
                values[f["tipo"]] = ""
                continue

            values[f["tipo"]] = text[pos_ini + len(f["ini"]) : pos_fim].strip()
            last_fim = pos_fim
            search_from = pos_fim  # próximo campo busca a partir daqui (corrige o bug do original)

        name = clean_product_name(values.get("NOM", ""))
        price = parse_price(values.get("PRC"))
        if name and price is not None:
            attributes: dict = {}
            vol = parse_volume_ml(name)
            if vol:
                attributes["volume_ml"] = vol
            if values.get("PAIS"):
                attributes["pais"] = values["PAIS"].strip()
            if values.get("ESTILO"):
                attributes["estilo"] = values["ESTILO"].strip()
            candidates.append(
                Candidate(
                    product_name=name,
                    brand=values.get("MARCA", "").strip() or None,
                    price=price,
                    url=absolute_url(store.site_url, values.get("URL")) or store.site_url,
                    image_url=absolute_url(store.site_url, values.get("IMG")),
                    attributes=attributes,
                )
            )

        count += 1
        pos = last_fim if last_fim != -1 else (anchor_pos or 0) + 1

    return candidates
