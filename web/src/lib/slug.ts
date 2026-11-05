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
//
// Cada palavra foi conferida contra o catálogo real antes de entrar: entra só a
// que aparece como RUÍDO de loja, não como parte do nome/marca. EXCLUÍDAS de
// propósito: russa/russo (60 dos 64 usos são a MARCA "Roleta Russa"),
// americano ("Copo Americano" — o produto é um copo), frances ("Carvalho
// Francês" — o barril). Espelha _MATCH_DESCRIPTORS de scraper/normalize.py.
const MATCH_DESCRIPTORS = new Set([
  "belga", "belgas", "alema", "alemao", "importada", "importado",
  "artesanal", "nacional", "especial",
  "brasileira", "brasileiro", "argentina", "argentino",
  "espanhola", "espanhol", "holandesa", "holandes",
  "inglesa", "ingles", "escocesa", "escoces",
  "irlandesa", "irlandes", "tcheca", "tcheco",
  "italiana", "italiano", "mexicana", "mexicano",
  "japonesa", "japones", "portuguesa", "portugues",
  "austriaca", "austriaco", "dinamarquesa", "dinamarques",
  "americana", "francesa",
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

// Partes da match_key ANTES de virar string: tokens de conteúdo (ordenados,
// sem repetição) e o volume. Separado de matchKey porque o detector de
// "possíveis duplicatas" (lib/duplicates.ts::groupByContainedMatchKey) precisa
// comparar os CONJUNTOS de tokens, não só as strings — um nome cuja loja
// embutiu a cervejaria ("Argentum Huyghe Delirium") ganha um token a mais e
// nunca bateria com "Delirium Argentum" por string. Não há equivalente em
// Python: esse detector é só do admin, a coleta usa a match_key inteira.
export function matchKeyParts(
  brand: string | null,
  name: string,
): { tokens: string[]; volume: number | null } {
  const base = name.replace(/\d+(?:[.,]\d+)?\s*(?:ml|cl|dl|kg|oz|l|g)\b/gi, " ");
  let tokens = fold(base)
    .split(" ")
    .filter((t) => t && !MATCH_NOISE.has(t));
  const content = tokens.filter((t) => !MATCH_GENERIC_STYLE.has(t));
  if (content.length === 0) {
    tokens = [...brandTokens(brand), ...tokens];
  }
  return { tokens: [...new Set(tokens)].sort(), volume: parseVolumeMl(name) };
}

// Palavras DISTINTIVAS da marca (sem as genéricas de cervejaria, sem as de 1-2
// letras). Exportada porque o detector de "possíveis duplicatas" precisa saber
// se a palavra que sobra entre dois nomes é o nome de uma CERVEJARIA (ruído) ou
// uma variante do produto ("dunkel", "alkoholfrei") — ver
// lib/duplicates.ts::groupByContainedMatchKey.
export function brandTokens(brand: string | null): string[] {
  return fold(brand ?? "")
    .split(" ")
    .filter((t) => t.length > 2 && !GENERIC_BRAND_WORDS.has(t));
}

// Chave de AGRUPAMENTO (não é a URL — essa é productSlug). Dois produtos com a
// mesma match_key são "o mesmo produto" pra fins de agregar ofertas.
export function matchKey(brand: string | null, name: string): string {
  const { tokens, volume } = matchKeyParts(brand, name);
  let key = tokens.length ? tokens.join("-") : slugify(name);
  if (volume) key += `-${volume}ml`;
  return key;
}
