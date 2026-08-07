"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";
import { normalizeDashes } from "@/lib/text";
import { buildBrandIndex, lookupBrand, type Brand, type BrandAlias } from "@/lib/brands";
import { fold } from "@/lib/slug";
import { patchProducts } from "@/lib/adminBatch";
import { resyncProductSlugsWith } from "@/lib/curation";
import {
  DEFAULT_BRAND_COUNTRY,
  fetchProductsForBrandSync,
  mergeBrand,
  syncBrandsFromProducts,
} from "@/lib/brandSync";

// ── CRUD de marcas ─────────────────────────────────────────────────

// Item 10: nome duplicado é bloqueado (não só o unique exato do banco — dois
// nomes que só diferem em caixa/acento também contam, mesmo critério de
// lookupBrand/missingBrandSuggestions).
async function findByFoldedName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  excludeId?: string,
): Promise<Brand | null> {
  const { data } = await supabase.from("brands").select("id, name, country");
  const brands = (data ?? []) as Brand[];
  const key = fold(name);
  return brands.find((b) => b.id !== excludeId && fold(b.name) === key) ?? null;
}

export async function addBrand(formData: FormData) {
  const name = normalizeDashes(((formData.get("name") as string) || "").trim());
  const country = ((formData.get("country") as string) || "").trim() || DEFAULT_BRAND_COUNTRY;
  const locale = await getLocale();
  if (!name) return;
  const supabase = await createClient();

  const dup = await findByFoldedName(supabase, name);
  if (dup) redirect(`/${locale}/admin/marcas?new=1&erro=duplicada`);

  const { error } = await supabase.from("brands").insert({ name, country });
  if (error) redirect(`/${locale}/admin/marcas?new=1&erro=salvar`);

  revalidateAllLocales("/admin/marcas");
  redirect(`/${locale}/admin/marcas`);
}

export type UpdateBrandResult =
  | { status: "ok" }
  | { status: "conflict"; existingId: string; existingName: string }
  | { status: "error" };

// Chamada diretamente pelo client (BrandForm), não como <form action>: item 8
// precisa do retorno pra decidir se pergunta sobre mesclar, e um redirect de
// Server Action não dá pra "responder" — mesmo padrão de mergeProductGroups
// em ferramentas/actions.ts.
export async function updateBrand(id: string, rawName: string, rawCountry: string | null): Promise<UpdateBrandResult> {
  const name = normalizeDashes(rawName.trim());
  const country = (rawCountry || "").trim() || DEFAULT_BRAND_COUNTRY;
  if (!id || !name) return { status: "error" };
  const supabase = await createClient();

  const dup = await findByFoldedName(supabase, name, id);
  if (dup) return { status: "conflict", existingId: dup.id, existingName: dup.name };

  const { error } = await supabase.from("brands").update({ name, country }).eq("id", id);
  if (error) return { status: "error" };

  revalidateAllLocales("/admin/marcas");
  revalidateAllLocales("/admin/produtos");
  return { status: "ok" };
}

// Item 9: chamada quando o usuário confirma a mesclagem sugerida por
// updateBrand. `sourceId` (a marca que estava sendo editada) é absorvida por
// `targetId` (a que já tinha aquele nome) — produtos e aliases migram, e
// `sourceId` é apagada.
export async function mergeBrandAction(sourceId: string, targetId: string): Promise<{ error: string | null }> {
  if (!sourceId || !targetId) return { error: "invalid" };
  const supabase = await createClient();
  const result = await mergeBrand(supabase, sourceId, targetId);
  if (!result.error) {
    revalidateAllLocales("/admin/marcas");
    revalidateAllLocales("/admin/produtos");
    revalidateAllLocales("/");
  }
  return result;
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

// ── Sincronizar com o catálogo de produtos (itens 1+2) ──────────────
export async function syncBrandsFromProductsAction() {
  const supabase = await createClient();
  const locale = await getLocale();

  let created = 0;
  try {
    ({ created } = await syncBrandsFromProducts(supabase));
  } catch {
    redirect(`/${locale}/admin/marcas?erro=sincronizar`);
  }

  revalidateAllLocales("/admin/marcas");
  redirect(`/${locale}/admin/marcas?criadas=${created}`);
}

// ── Aplicar o catálogo aos produtos já existentes ──────────────────
// Sem isto, cadastrar uma marca nova só afetaria produtos futuros — mesmo
// furo que "Reclassificar existentes" resolveu pra category_keywords.
export async function applyBrandsToProducts() {
  const supabase = await createClient();
  const locale = await getLocale();

  const [{ data: brandsData }, { data: aliasesData }, products] = await Promise.all([
    supabase.from("brands").select("id, name, country"),
    supabase.from("brand_aliases").select("id, brand_id, alias"),
    fetchProductsForBrandSync(supabase),
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
