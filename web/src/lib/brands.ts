// Catálogo normalizado de marcas (`brands`/`brand_aliases`, migration 0021)
// — autoridade sobre `products.brand` (nome canônico + país) quando a marca
// tem alias cadastrado. Substitui o de/para (`text_replacements`) pra marca.
// Lógica pura (sem I/O), mesmo padrão de replacements.ts/duplicates.ts —
// espelha scraper/brands.py.
import { fold } from "./slug";

export type Brand = { id: string; name: string; country: string | null };
export type BrandAlias = { id: string; brand_id: string; alias: string };
export type BrandMatch = { name: string; country: string | null };

// Mapa fold(alias) -> {name, country}. Cada marca também entra "de si
// mesma" (o próprio nome canônico é um alias implícito) — cadastrar
// "Paulaner" já bate com uma fonte que grava exatamente "Paulaner", sem
// precisar de alias explícito nenhum.
export function buildBrandIndex(brands: Brand[], aliases: BrandAlias[]): Map<string, BrandMatch> {
  const byId = new Map(brands.map((b) => [b.id, { name: b.name, country: b.country }]));
  const index = new Map<string, BrandMatch>();
  for (const b of brands) index.set(fold(b.name), { name: b.name, country: b.country });
  for (const a of aliases) {
    const target = byId.get(a.brand_id);
    if (target) index.set(fold(a.alias), target);
  }
  return index;
}

// null = não achou nada cadastrado — quem chama mantém o que já tinha
// (comportamento de antes desta migration).
export function lookupBrand(
  index: Map<string, BrandMatch>,
  rawBrand: string | null,
): BrandMatch | null {
  if (!rawBrand) return null;
  return index.get(fold(rawBrand)) ?? null;
}
