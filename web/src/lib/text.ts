// Padroniza travessão (—) e meia-risca (–) pra hífen simples em texto
// digitado no admin, antes de gravar — mesmo padrão do scraper
// (scraper/normalize.py normalize_dashes), ver migration 0008 pro backfill
// do que já existia.
export function normalizeDashes(text: string): string {
  return text.replace(/[—–‑]/g, "-");
}
