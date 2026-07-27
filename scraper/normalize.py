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


def _fold(text: str) -> str:
    """Minúsculas, sem acento e sem pontuação — para comparar se a marca já
    está no nome sem tropeçar em variações de escrita.

    Apóstrofo é REMOVIDO em vez de virar espaço: "FULLER'S" precisa virar
    "fullers" pra bater com a marca "Fullers"; se virasse "fuller s", a
    comparação falharia e o nome ganharia um prefixo redundante."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


# Palavras que aparecem em nome de cervejaria sem distinguir marca alguma —
# comparar por elas daria falso positivo ("Cervejaria Dogma" vs "Cervejaria
# Artesanal XYZ"), então saem da comparação.
_GENERIC_BRAND_WORDS = {
    "cervejaria", "cerveja", "cervejas", "brewing", "brewery", "brauerei",
    "bier", "beer", "bebidas", "oficial", "gruppe", "gmbh", "kgaa", "ltda",
    "sa", "co", "the", "company",
}


def name_contains_brand(name: str, brand: str) -> bool:
    """A marca já aparece no nome?

    Compara a sequência inteira e, se não bater, exige que as palavras
    DISTINTIVAS da marca estejam no nome — assim "Cervejaria Dogma" é
    reconhecida em "Dogma IPA" (a parte genérica não conta) sem que
    "Cervejaria Dogma" seja reconhecida em "Cervejaria Artesanal XYZ"."""
    if not brand:
        return True
    folded_name, folded_brand = _fold(name), _fold(brand)
    if not folded_brand:
        return True
    if folded_brand in folded_name:
        return True
    palavras_nome = set(folded_name.split())
    distintivas = [
        w for w in folded_brand.split() if len(w) > 2 and w not in _GENERIC_BRAND_WORDS
    ]
    return bool(distintivas) and all(w in palavras_nome for w in distintivas)


def prefix_brand(name: str, brand: str | None) -> str:
    """Nome do produto = marca + descritivo.

    "IPA" da Dogma não é identificável como produto; "Dogma IPA" é — mesma
    razão de "Fanta Laranja" não ser só "Laranja". Lojas próprias não repetem
    a marca no nome (dentro do site delas é redundante), então aqui ela entra.
    Só prefixa quando a marca AINDA não está no nome, pra não gerar
    "Erdinger Erdinger Weissbier"."""
    if not brand or name_contains_brand(name, brand):
        return name
    return f"{brand} {name}"


def product_slug(brand: str | None, name: str) -> str:
    """Identidade do produto: marca + descritivo.

    A marca faz parte da chave de propósito — sem ela, o "IPA" da Dogma
    colidiria com o "IPA" de qualquer outra cervejaria e ofertas de produtos
    DIFERENTES seriam agregadas. Mas quando o nome já começa com a marca (o
    caso das lojas próprias depois de `prefix_brand`), repetir daria
    "dogma-dogma-ipa" — então o nome basta, e continua único porque já contém
    a marca. Espelhado em web/src/lib/slug.ts::productSlug."""
    if brand and name_contains_brand(name, brand):
        return slugify(name)
    return slugify(f"{brand or ''} {name}")


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
