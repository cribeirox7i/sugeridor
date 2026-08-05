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

export type BrandSuggestion = { name: string; count: number };

// Marcas que aparecem em `products.brand` mas ainda não têm entrada no
// catálogo (nem como nome canônico, nem como alias de outra) — pra
// completar o cadastro sem digitar cada nome do zero. Agrupa por fold()
// porque a mesma marca vem em variações de caixa/acento entre lojas
// diferentes; o nome sugerido é a grafia mais frequente entre elas, e a
// contagem soma todas as variações juntas.
export function missingBrandSuggestions(
  productBrands: (string | null)[],
  index: Map<string, BrandMatch>,
): BrandSuggestion[] {
  const byFold = new Map<string, Map<string, number>>();
  for (const raw of productBrands) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const key = fold(trimmed);
    if (index.has(key)) continue;
    const byRaw = byFold.get(key) ?? new Map<string, number>();
    byRaw.set(trimmed, (byRaw.get(trimmed) ?? 0) + 1);
    byFold.set(key, byRaw);
  }

  const suggestions: BrandSuggestion[] = [];
  for (const byRaw of byFold.values()) {
    let bestName = "";
    let bestCount = -1;
    let total = 0;
    for (const [raw, n] of byRaw) {
      total += n;
      if (n > bestCount) {
        bestCount = n;
        bestName = raw;
      }
    }
    suggestions.push({ name: bestName, count: total });
  }
  return suggestions.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
}
