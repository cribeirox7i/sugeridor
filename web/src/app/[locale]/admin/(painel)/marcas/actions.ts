"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";
import { normalizeDashes } from "@/lib/text";
import { buildBrandIndex, lookupBrand, type Brand, type BrandAlias } from "@/lib/brands";
import { patchProducts } from "@/lib/adminBatch";
import { resyncProductSlugsWith } from "@/lib/curation";

// ── CRUD de marcas ─────────────────────────────────────────────────
export async function addBrand(formData: FormData) {
  const name = normalizeDashes(((formData.get("name") as string) || "").trim());
  const country = ((formData.get("country") as string) || "").trim() || null;
  if (!name) return;
  const supabase = await createClient();
  // unique(name): marca duplicada é ignorada em silêncio, mesmo padrão de
  // addReplacement/addKeyword.
  await supabase.from("brands").upsert({ name, country }, { onConflict: "name", ignoreDuplicates: true });
  revalidateAllLocales("/admin/marcas");
}

export async function updateBrand(formData: FormData) {
  const id = formData.get("id") as string;
  const name = normalizeDashes(((formData.get("name") as string) || "").trim());
  const country = ((formData.get("country") as string) || "").trim() || null;
  if (!id || !name) return;
  const supabase = await createClient();
  await supabase.from("brands").update({ name, country }).eq("id", id);
  revalidateAllLocales("/admin/marcas");
}

export async function deleteBrand(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  // brand_aliases tem ON DELETE CASCADE (migration 0021) — os aliases dela
  // somem junto, sem precisar apagar em dois passos.
  await supabase.from("brands").delete().eq("id", id);
  revalidateAllLocales("/admin/marcas");
}

// ── CRUD de aliases (variações encontradas nas lojas) ──────────────
export async function addBrandAlias(formData: FormData) {
  const brand_id = formData.get("brand_id") as string;
  const alias = normalizeDashes(((formData.get("alias") as string) || "").trim());
  if (!brand_id || !alias) return;
  const supabase = await createClient();
  // unique(alias): duas marcas não podem reivindicar o mesmo alias — se já
  // existir (dessa marca ou de outra), ignora em silêncio.
  await supabase
    .from("brand_aliases")
    .upsert({ brand_id, alias }, { onConflict: "alias", ignoreDuplicates: true });
  revalidateAllLocales("/admin/marcas");
}

export async function deleteBrandAlias(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("brand_aliases").delete().eq("id", id);
  revalidateAllLocales("/admin/marcas");
}

// ── Aplicar o catálogo aos produtos já existentes ──────────────────
// Sem isto, cadastrar uma marca nova só afetaria produtos futuros — mesmo
// furo que "Reclassificar existentes" resolveu pra category_keywords.
//
// PRECISA de `attributes` (que fetchAllProducts não traz, ver lib/curation.ts)
// pra poder também preencher o país — daí o select próprio em vez de
// reaproveitar o helper genérico.
type ProductForBrands = {
  id: string;
  name: string;
  brand: string | null;
  canonical_slug: string;
  attributes: Record<string, string | number> | null;
};

const PAGE_SIZE = 1000;

async function fetchProductsForBrands(supabase: SupabaseClient): Promise<ProductForBrands[]> {
  const all: ProductForBrands[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, brand, canonical_slug, attributes")
      .order("created_at")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as ProductForBrands[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

export async function applyBrandsToProducts() {
  const supabase = await createClient();
  const locale = await getLocale();

  const [{ data: brandsData }, { data: aliasesData }, products] = await Promise.all([
    supabase.from("brands").select("id, name, country"),
    supabase.from("brand_aliases").select("id, brand_id, alias"),
    fetchProductsForBrands(supabase),
  ]);

  const index = buildBrandIndex(
    (brandsData ?? []) as Brand[],
    (aliasesData ?? []) as BrandAlias[],
  );

  const patches: { id: string; brand: string; attributes: Record<string, string | number> }[] = [];
  for (const p of products) {
    const match = lookupBrand(index, p.brand);
    if (!match) continue;
    const attributes = { ...(p.attributes ?? {}) };
    let changed = false;
    if (p.brand !== match.name) changed = true;
    // País do catálogo de marcas é autoridade — sobrescreve, mesmo espírito
    // da regra A de país (loja própria) já existente.
    if (match.country && attributes.pais !== match.country) {
      attributes.pais = match.country;
      changed = true;
    }
    if (changed) patches.push({ id: p.id, brand: match.name, attributes });
  }

  const { error, updated } = await patchProducts(supabase, patches);
  if (error) redirect(`/${locale}/admin/marcas?erro=aplicar`);

  // Ressincronizar é ESSENCIAL depois de renomear marca — o slug deriva de
  // marca+nome. Encadeado aqui, não como passo manual separado (é o mesmo
  // bug já documentado em docs/05-roadmap.md: esquecer isso faz a coleta
  // seguinte duplicar cada produto renomeado).
  const { updated: resynced, skipped, error: resyncError } = await resyncProductSlugsWith(supabase);
  if (resyncError) redirect(`/${locale}/admin/marcas?erro=resync`);

  revalidateAllLocales("/admin/marcas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(
    `/${locale}/admin/marcas?aplicados=${updated}&ressincronizados=${resynced}&conflitos=${skipped}`,
  );
}
