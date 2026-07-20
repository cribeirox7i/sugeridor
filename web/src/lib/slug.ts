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
