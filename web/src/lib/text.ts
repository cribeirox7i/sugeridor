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

// Nome do produto em Title Case (primeira letra de cada palavra maiúscula),
// com artigos/preposições minúsculos e siglas de estilo sempre maiúsculas —
// mesmo padrão espelhado em scraper/normalize.py::title_case_pt. Só se aplica
// a `products.name`; `brand` continua exatamente como a fonte grava.
export function titleCaseProductName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (UPPERCASE_ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
