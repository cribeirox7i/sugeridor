// I/O contra `brands`/`products` que não cabia em lib/brands.ts (lógica
// pura, sem banco). Espelha scraper/brands.py — ver comentário lá pro porquê
// da mesma regra existir nos dois lados.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fold } from "./slug";
import { buildBrandIndex, lookupBrand, type Brand, type BrandAlias } from "./brands";
import { patchProducts } from "./adminBatch";
import { resyncProductSlugsWith } from "./curation";

export const DEFAULT_BRAND_COUNTRY = "Brasil";

const PAGE_SIZE = 1000;

type ProductForBrandSync = {
  id: string;
  brand: string | null;
  attributes: Record<string, string | number> | null;
};

// Paginado: PostgREST corta em 1000 linhas sem avisar (mesma cautela de
// curation.ts::fetchAllProducts). `attributes` entra porque é onde mora o
// país do PRODUTO (`attributes.pais`), usado tanto pro backfill quanto pro
// merge.
export async function fetchProductsForBrandSync(
  supabase: SupabaseClient,
): Promise<ProductForBrandSync[]> {
  const all: ProductForBrandSync[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, brand, attributes")
      .order("created_at")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ProductForBrandSync[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

// Garante que `rawName` existe em `brands`, cadastrando com `country` (Brasil
// se não vier nenhum) quando ainda não está no catálogo. Só faz sentido
// chamar depois que `lookupBrand` já devolveu null pra esse texto — espelha
// scraper/brands.py::ensure_brand, usado pelo cadastro manual de produto
// (produtos/actions.ts::saveProduct) do mesmo jeito que o scraper usa pra
// coleta.
export async function ensureBrand(
  supabase: SupabaseClient,
  rawName: string,
  country: string | null,
): Promise<{ name: string; country: string | null }> {
  const name = rawName.trim();
  if (!name) return { name: rawName, country };
  const finalCountry = country || DEFAULT_BRAND_COUNTRY;
  const { data } = await supabase
    .from("brands")
    .upsert({ name, country: finalCountry }, { onConflict: "name", ignoreDuplicates: true })
    .select("name, country")
    .maybeSingle();
  if (data) return data as { name: string; country: string | null };
  // ignoreDuplicates + já existia (corrida com outro request) -> upsert não
  // devolve linha nenhuma; busca a que já está lá.
  const { data: existing } = await supabase
    .from("brands")
    .select("name, country")
    .eq("name", name)
    .maybeSingle();
  return (existing as { name: string; country: string | null } | null) ?? { name, country: finalCountry };
}

function mostFrequent(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [key, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      best = key;
    }
  }
  return best;
}

// Item 1+2 da leva de marcas (2026-08-07): varre `products.brand` +
// `attributes.pais` e cadastra em `brands` toda marca que aparece nos
// produtos mas ainda não está no catálogo (nem como nome canônico, nem como
// alias de outra) — mesmo critério de `missingBrandSuggestions`, mas
// cadastrando direto em vez de pedir um clique por marca. Nome = grafia mais
// frequente entre as variações; país = mais frequente entre os produtos
// daquela marca, ou Brasil se nenhum produto tiver país preenchido.
export async function syncBrandsFromProducts(
  supabase: SupabaseClient,
): Promise<{ created: number }> {
  const [{ data: brandsData }, { data: aliasesData }] = await Promise.all([
    supabase.from("brands").select("id, name, country"),
    supabase.from("brand_aliases").select("id, brand_id, alias"),
  ]);
  const index = buildBrandIndex((brandsData ?? []) as Brand[], (aliasesData ?? []) as BrandAlias[]);
  const products = await fetchProductsForBrandSync(supabase);

  const groups = new Map<string, { names: Map<string, number>; countries: Map<string, number> }>();
  for (const p of products) {
    const raw = p.brand?.trim();
    if (!raw) continue;
    if (lookupBrand(index, raw)) continue;
    const key = fold(raw);
    const group = groups.get(key) ?? { names: new Map(), countries: new Map() };
    group.names.set(raw, (group.names.get(raw) ?? 0) + 1);
    const pais = p.attributes?.pais;
    if (typeof pais === "string" && pais.trim()) {
      group.countries.set(pais.trim(), (group.countries.get(pais.trim()) ?? 0) + 1);
    }
    groups.set(key, group);
  }

  const rows = [...groups.values()]
    .map((g) => ({
      name: mostFrequent(g.names)!,
      country: mostFrequent(g.countries) ?? DEFAULT_BRAND_COUNTRY,
    }))
    .filter((r) => r.name);
  if (rows.length === 0) return { created: 0 };

  const { error } = await supabase.from("brands").upsert(rows, { onConflict: "name", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return { created: rows.length };
}

// Item 8+9: mescla `sourceId` em `targetId` — todo produto cujo `brand`
// resolva pro nome canônico de `source` OU pra algum alias dela passa a usar
// o nome/país de `target`, os aliases de `source` migram pra `target` (o
// próprio nome de `source` também vira alias, pra produtos com essa grafia
// continuarem resolvendo certo), e `source` é apagada. Ressincroniza slugs no
// fim — igual a `applyBrandsToProducts`, essencial porque o slug deriva de
// marca+nome.
export async function mergeBrand(
  supabase: SupabaseClient,
  sourceId: string,
  targetId: string,
): Promise<{ error: string | null }> {
  if (sourceId === targetId) return { error: null };

  const [{ data: source }, { data: target }, { data: sourceAliasesData }] = await Promise.all([
    supabase.from("brands").select("id, name, country").eq("id", sourceId).maybeSingle(),
    supabase.from("brands").select("id, name, country").eq("id", targetId).maybeSingle(),
    supabase.from("brand_aliases").select("id, alias").eq("brand_id", sourceId),
  ]);
  if (!source || !target) return { error: "not-found" };

  const sourceAliases = (sourceAliasesData ?? []) as { id: string; alias: string }[];
  const matchTexts = new Set([fold(source.name), ...sourceAliases.map((a) => fold(a.alias))]);

  const products = await fetchProductsForBrandSync(supabase);
  const patches: { id: string; brand: string; attributes: Record<string, string | number> }[] = [];
  for (const p of products) {
    if (!p.brand || !matchTexts.has(fold(p.brand))) continue;
    const attributes = { ...(p.attributes ?? {}) };
    let changed = false;
    if (p.brand !== target.name) changed = true;
    if (target.country && attributes.pais !== target.country) {
      attributes.pais = target.country;
      changed = true;
    }
    if (changed) patches.push({ id: p.id, brand: target.name, attributes });
  }
  const { error: patchError } = await patchProducts(supabase, patches);
  if (patchError) return { error: patchError };

  // Move os aliases; se colidir (unique em `alias` — já aponta pro alvo ou
  // pra outra marca), a linha do source é descartada em vez de tentar violar
  // o índice.
  for (const a of sourceAliases) {
    const { error: updateError } = await supabase
      .from("brand_aliases")
      .update({ brand_id: targetId })
      .eq("id", a.id);
    if (updateError) {
      await supabase.from("brand_aliases").delete().eq("id", a.id);
    }
  }
  await supabase
    .from("brand_aliases")
    .upsert({ brand_id: targetId, alias: source.name }, { onConflict: "alias", ignoreDuplicates: true });

  await supabase.from("brands").delete().eq("id", sourceId);

  const { error: resyncError } = await resyncProductSlugsWith(supabase);
  if (resyncError) return { error: resyncError };

  return { error: null };
}
