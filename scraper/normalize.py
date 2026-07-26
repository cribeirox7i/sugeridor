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


# Padroniza travessão (—) e meia-risca (–) pra hífen simples — texto raspado
# de sites variados traz os três conforme o editor de cada loja, e o pedido é
# manter só '-' no que é gravado no banco (ver migration 0008 pro backfill do
# que já existia).
def normalize_dashes(text: str) -> str:
    return text.replace("—", "-").replace("–", "-").replace("‑", "-")


# Remove prefixo "Cerveja " que o site costuma colocar no nome, pra o slug ficar
# mais próximo do que um humano digitaria no admin.
def clean_product_name(name: str) -> str:
    return normalize_dashes(re.sub(r"^\s*cerveja\s+", "", name, flags=re.IGNORECASE).strip())


# Artigos/preposições/conjunções comuns em pt/es que ficam minúsculos no
# Title Case, exceto quando são a primeira palavra do nome — mesma lista
# espelhada em web/src/lib/text.ts::titleCaseProductName.
_LOWERCASE_WORDS = {
    "a", "o", "os", "as", "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
    "por", "para", "com", "e",
    "el", "la", "los", "las", "del", "al", "en", "un", "una", "y",
}

# Siglas de estilo de cerveja que ficam sempre maiúsculas — sem essa lista,
# Title Case ingênuo transformaria "IPA" em "Ipa".
_UPPERCASE_ACRONYMS = {"ipa", "apa", "neipa", "dipa", "tipa", "ipl", "esb", "ris", "abv", "ba"}


def title_case_pt(name: str) -> str:
    """Nome em Title Case, com artigos/preposições minúsculos e siglas de
    estilo sempre maiúsculas. Substitui o `.upper()` usado antes só no título
    (nunca em `brand`, que continua exatamente como a fonte grava)."""
    words = name.split()
    result = []
    for i, word in enumerate(words):
        lower = word.lower()
        if lower in _UPPERCASE_ACRONYMS:
            result.append(lower.upper())
        elif i > 0 and lower in _LOWERCASE_WORDS:
            result.append(lower)
        else:
            result.append(lower[:1].upper() + lower[1:])
    return " ".join(result)


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
