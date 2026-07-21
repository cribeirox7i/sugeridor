"""Normalização de dados — precisa espelhar o slugify do frontend
(web/src/lib/slug.ts) pra que produtos criados no admin e pelo scraper
dedupliquem consistentemente."""
import re
import unicodedata


def slugify(text: str) -> str:
    # NFD + remove marcas diacríticas (equivalente ao replace de acentos do TS).
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text


# Remove prefixo "Cerveja " que o site costuma colocar no nome, pra o slug ficar
# mais próximo do que um humano digitaria no admin.
def clean_product_name(name: str) -> str:
    return re.sub(r"^\s*cerveja\s+", "", name, flags=re.IGNORECASE).strip()


def parse_volume_ml(name: str) -> int | None:
    """Extrai volume em ml do nome. Trata '330ml', '355 ml', '500ML', '1L', '1,5L'."""
    # litros
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*l\b", name, flags=re.IGNORECASE)
    if m:
        litros = float(m.group(1).replace(",", "."))
        return int(round(litros * 1000))
    # mililitros
    m = re.search(r"(\d+)\s*ml\b", name, flags=re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None
