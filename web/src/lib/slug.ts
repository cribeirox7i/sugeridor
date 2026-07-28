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
