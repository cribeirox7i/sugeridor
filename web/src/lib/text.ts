// Padroniza travessão (—) e meia-risca (–) pra hífen simples em texto
// digitado no admin, antes de gravar — mesmo padrão do scraper
// (scraper/normalize.py normalize_dashes), ver migration 0008 pro backfill
// do que já existia.
export function normalizeDashes(text: string): string {
  return text.replace(/[—–‑]/g, "-");
}

// Artigos/preposições/conjunções comuns em pt/es que ficam minúsculos no
// Title Case, exceto quando são a primeira palavra do nome.
const LOWERCASE_WORDS = new Set([
  "a", "o", "os", "as", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "por", "para", "com", "e",
  "el", "la", "los", "las", "del", "al", "en", "un", "una", "y",
]);

// Siglas de estilo de cerveja que ficam sempre maiúsculas — sem essa lista,
// Title Case ingênuo transformaria "IPA" em "Ipa".
const UPPERCASE_ACRONYMS = new Set(["ipa", "apa", "neipa", "dipa", "tipa", "ipl", "esb", "ris", "abv", "ba"]);

// Forma canônica de cada unidade de medida. O símbolo do litro é 'L' maiúsculo
// (o minúsculo se confunde com o dígito 1); os prefixados ficam minúsculos.
// Espelha _UNIT_CANONICAL de scraper/normalize.py.
const UNIT_CANONICAL: Record<string, string> = {
  ml: "ml", cl: "cl", dl: "dl", l: "L", kg: "kg", g: "g", oz: "oz",
};

// Palavra colada na MEDIDA ("Urweisse500ml"). Só separa quando os dígitos são
// de fato uma medida (o lookahead exige a unidade depois) — senão "Abt 12" e
// "Kasteel 4+1" seriam picados sem motivo.
const WORD_BEFORE_MEASURE = /(?<=\p{L})(?=\d+(?:[.,]\d+)?[ \t]*(?:ml|cl|dl|kg|oz|l|g)(?!\w))/giu;

// Unidade colada no número, com ou sem espaço. As de duas letras vêm antes das
// de uma pra "ml" não ser lido como "l" solto, e o lookbehind de dígito é o que
// impede casar a letra final de uma palavra ("Duvel" não vira "Duve L", e o
// 'g' de "500kg" não casa sozinho).
const GLUED_UNIT = /(?<=\d)[ \t]*(ml|cl|dl|kg|oz|l|g)(?!\w)/gi;

// Isola a medida no nome: "Erdinger Urweisse500ml" -> "Erdinger Urweisse 500 ml".
//
// São dois cortes, e os dois são necessários: entre a palavra e o número (é o
// que produzia nome ilegível como "Tripel Karmeliet750ml", e o que fazia o
// Title Case estragar sigla de estilo, porque "IPA355ml" é uma palavra só e
// virava "Ipa355ml"), e entre o número e a unidade (uniformizando espaço e
// caixa: "500ML", "330Ml" e "500 ml" convergem).
//
// Sem isso o MESMO volume escrito de duas formas virava dois produtos: o slug
// deriva do nome, então "Erdinger Urweisse500ml" e "Erdinger Urweisse 500ml"
// são registros distintos que nunca agregam ofertas.
//
// Idempotente. Espelha scraper/normalize.py::separate_units — mudar de um lado
// só dessincroniza o slug que a coleta calcula do que o admin calcula, e a
// coleta seguinte cria uma duplicata de cada produto (ver web/src/lib/slug.ts).
export function separateUnits(name: string): string {
  return name
    .replace(WORD_BEFORE_MEASURE, " ")
    .replace(GLUED_UNIT, (_m, unit: string) => ` ${UNIT_CANONICAL[unit.toLowerCase()]}`);
}

// Nome do produto em Title Case (primeira letra de cada palavra maiúscula),
// com artigos/preposições minúsculos, siglas de estilo sempre maiúsculas e
// unidades de medida na forma canônica — mesmo padrão espelhado em
// scraper/normalize.py::title_case_pt. Só se aplica a `products.name`; `brand`
// continua exatamente como a fonte grava.
//
// A unidade precisa estar aqui porque `separateUnits` a solta como palavra
// própria: sem isso o Title Case a capitalizava e o catálogo ficava com
// "330 Ml" (aconteceu com 17 produtos).
export function titleCaseProductName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (UNIT_CANONICAL[lower]) return UNIT_CANONICAL[lower];
      if (UPPERCASE_ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
