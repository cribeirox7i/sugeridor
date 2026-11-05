// Slug canônico: lowercase, sem acento, hífens. Usado pra URL amigável do
// produto e como base do matching/dedup (ver docs/04-conectores-ingestao.md).
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove marcas diacríticas (acentos)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Minúsculas, sem acento e sem pontuação — pra comparar se a marca já está no
// nome sem tropeçar em variações de escrita. O apóstrofo é REMOVIDO em vez de
// virar espaço: "FULLER'S" precisa virar "fullers" pra bater com a marca
// "Fullers"; virando "fuller s" o nome ganharia prefixo redundante.
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Palavras que aparecem em nome de cervejaria sem distinguir marca alguma —
// comparar por elas daria falso positivo ("Cervejaria Dogma" vs "Cervejaria
// Artesanal XYZ"). Espelha _GENERIC_BRAND_WORDS de scraper/normalize.py.
const GENERIC_BRAND_WORDS = new Set([
  "cervejaria", "cerveja", "cervejas", "brewing", "brewery", "brauerei",
  "bier", "beer", "bebidas", "oficial", "gruppe", "gmbh", "kgaa", "ltda",
  "sa", "co", "the", "company",
]);

// Espelha scraper/normalize.py::name_contains_brand — exige que as palavras
// DISTINTIVAS da marca estejam no nome, então "Cervejaria Dogma" é reconhecida
// em "Dogma IPA" sem reconhecer "Cervejaria Dogma" em "Cervejaria Artesanal X".
export function nameContainsBrand(name: string, brand: string | null): boolean {
  if (!brand) return true;
  const foldedName = fold(name);
  const foldedBrand = fold(brand);
  if (!foldedBrand) return true;
  if (foldedName.includes(foldedBrand)) return true;
  const nameWords = new Set(foldedName.split(" "));
  const distinctive = foldedBrand
    .split(" ")
    .filter((w) => w.length > 2 && !GENERIC_BRAND_WORDS.has(w));
  return distinctive.length > 0 && distinctive.every((w) => nameWords.has(w));
}

// Nome do produto = marca + descritivo. "IPA" da Dogma não identifica nada;
// "Dogma IPA" identifica — mesma razão de "Fanta Laranja" não ser só
// "Laranja". Espelha scraper/normalize.py::prefix_brand.
export function prefixBrand(name: string, brand: string | null): string {
  if (!brand || nameContainsBrand(name, brand)) return name;
  return `${brand} ${name}`;
}

// Identidade do produto: marca + descritivo. A marca faz parte da chave de
// propósito — sem ela o "IPA" da Dogma colidiria com o "IPA" de outra
// cervejaria e ofertas de produtos DIFERENTES seriam agregadas. Mas quando o
// nome já contém a marca, repetir daria "dogma-dogma-ipa": aí o nome basta, e
// segue único porque já traz a marca. Espelha
// scraper/normalize.py::product_slug.
export function productSlug(brand: string | null, name: string): string {
  if (brand && nameContainsBrand(name, brand)) return slugify(name);
  return slugify(`${brand ?? ""} ${name}`);
}

// ── match_key: identidade de AGRUPAMENTO ───────────────────────────────
// DIFERENTE de productSlug/canonical_slug (a URL única do produto). O slug
// exige nome idêntico entre lojas pra agregar ofertas, e num agregador cada
// loja escreve diferente ("Garrafa"/"Lata", prefixo "Belga"/"Alemã", ordem das
// palavras, marca cervejaria vs rótulo), então o mesmo produto virava N
// produtos. A match_key normaliza: tira embalagem/descritor, ordena o resto e
// põe o volume como discriminador. Espelha scraper/normalize.py::match_key —
// mudar de um lado só dessincroniza o agrupamento que a coleta calcula do que o
// admin calcula, e as duplicatas voltam.

// Tier 1 — formato/embalagem. Remoção segura: nunca distingue um produto.
const MATCH_PACKAGING = new Set([
  "garrafa", "garrafas", "lata", "latas", "latao", "longneck", "long",
  "neck", "pack", "growler", "barril", "unidade", "unidades", "un", "und",
  "unid", "pet", "descartavel", "retornavel", "caixa", "cx", "display",
  "kit", "combo", "gfa",
]);

// Tier 2 — descritores de nacionalidade/qualificação prefixados por algumas
// lojas. Mais arriscado que o Tier 1; é onde mora o risco de over-merge.
const MATCH_DESCRIPTORS = new Set([
  "belga", "belgas", "alema", "alemao", "importada", "importado",
  "artesanal", "nacional", "especial",
]);

// Estilos genéricos: não identificam um produto sozinhos. Quando TODAS as
// palavras de conteúdo são estilo, o nome precisa da marca ("IPA" da Dogma vira
// "dogma-ipa"). O estilo continua na chave; só a decisão "preciso da marca?"
// olha esta lista.
const MATCH_GENERIC_STYLE = new Set([
  "ipa", "apa", "neipa", "dipa", "tipa", "ipl", "xipa", "session",
  "lager", "pilsen", "pilsner", "puro", "malte", "weiss", "weissbier",
  "witbier", "weizen", "hefeweizen", "hefe", "stout", "porter", "ale",
  "pale", "blonde", "blond", "bock", "dunkel", "helles", "saison",
  "tripel", "dubbel", "quadrupel", "amber", "red", "brown", "golden",
  "imperial", "double", "sour", "gose", "berliner", "kolsch", "marzen",
  "vienna", "schwarzbier", "barleywine", "cream", "milk", "dry", "strong",
  "dark", "light", "black", "white", "wheat", "trigo",
]);

const MATCH_NOISE = new Set([...MATCH_PACKAGING, ...MATCH_DESCRIPTORS]);

// Volume (número + unidade) em qualquer parte do nome. Espelha
// scraper/normalize.py::parse_volume_ml.
function parseVolumeMl(name: string): number | null {
  const litros = name.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (litros) return Math.round(parseFloat(litros[1].replace(",", ".")) * 1000);
  const ml = name.match(/(\d+)\s*ml\b/i);
  if (ml) return parseInt(ml[1], 10);
  return null;
}

// Chave de AGRUPAMENTO (não é a URL — essa é productSlug). Dois produtos com a
// mesma match_key são "o mesmo produto" pra fins de agregar ofertas.
export function matchKey(brand: string | null, name: string): string {
  const base = name.replace(/\d+(?:[.,]\d+)?\s*(?:ml|cl|dl|kg|oz|l|g)\b/gi, " ");
  let tokens = fold(base)
    .split(" ")
    .filter((t) => t && !MATCH_NOISE.has(t));
  const content = tokens.filter((t) => !MATCH_GENERIC_STYLE.has(t));
  if (content.length === 0) {
    const brandTokens = fold(brand ?? "")
      .split(" ")
      .filter((t) => t.length > 2 && !GENERIC_BRAND_WORDS.has(t));
    tokens = [...brandTokens, ...tokens];
  }
  const keyTokens = [...new Set(tokens)].sort();
  let key = keyTokens.length ? keyTokens.join("-") : slugify(name);
  const vol = parseVolumeMl(name);
  if (vol) key += `-${vol}ml`;
  return key;
}
