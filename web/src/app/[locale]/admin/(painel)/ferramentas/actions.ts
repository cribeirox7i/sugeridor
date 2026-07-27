"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";
import { normalizeDashes } from "@/lib/text";
import { slugify } from "@/lib/slug";
import { planReplacements, type ProductForReplace, type Replacement } from "@/lib/replacements";
import { planMerge, type MergeOffer } from "@/lib/merge";

// Lote de linhas por escrita — mesma cautela dos outros backfills do admin.
const BATCH_SIZE = 200;
// O PostgREST corta em 1000 linhas sem avisar; ler paginado é obrigatório
// (products já passou de 1000).
const PAGE_SIZE = 1000;

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function fetchAllProducts(supabase: SupabaseLike): Promise<ProductForReplace[]> {
  const all: ProductForReplace[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, brand, canonical_slug")
      .order("created_at")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as ProductForReplace[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

// ── CRUD das regras de/para ───────────────────────────────────────
export async function addReplacement(formData: FormData) {
  const target = (formData.get("target") as string) || "";
  // `search` NÃO é trimado: "Alemã " com espaço no fim é justamente o que
  // impede a regra de casar "Alemãzinha", e é o caso de uso original.
  const search = normalizeDashes((formData.get("search") as string) ?? "");
  const replace = normalizeDashes(((formData.get("replace") as string) || "").trim());
  if (!["name", "brand"].includes(target) || !search) return;

  const supabase = await createClient();
  // Duplicata (unique target+search) é ignorada em silêncio — a regra já
  // existe, mesmo padrão de addKeyword na tela de Classificação.
  await supabase.from("text_replacements").insert({ target, search, replace });
  revalidateAllLocales("/admin/ferramentas");
}

export async function deleteReplacement(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("text_replacements").delete().eq("id", id);
  revalidateAllLocales("/admin/ferramentas");
}

export async function toggleReplacement(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("text_replacements").update({ active: !active }).eq("id", id);
  revalidateAllLocales("/admin/ferramentas");
}

// ── Aplicar as substituições ──────────────────────────────────────
// Aplica só onde o slug resultante não colide com outro produto. Colisão
// significa "estes dois registros são o mesmo produto", e resolver isso move
// ofertas e apaga um produto — decisão do usuário, caso a caso (ver
// mergeProducts). Os conflitos voltam listados na própria tela.
export async function applyReplacementsAction() {
  const supabase = await createClient();
  const [{ data: rulesData }, products] = await Promise.all([
    supabase.from("text_replacements").select("*").eq("active", true),
    fetchAllProducts(supabase),
  ]);

  const rules = (rulesData ?? []) as Replacement[];
  if (rules.length === 0) {
    const locale = await getLocale();
    redirect(`/${locale}/admin/ferramentas?aplicados=0&conflitos=0`);
  }

  const { toUpdate, conflicts } = planReplacements(products, rules);

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      canonical_slug: p.canonical_slug,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("products").upsert(batch, { onConflict: "id" });
    if (error) {
      const locale = await getLocale();
      redirect(`/${locale}/admin/ferramentas?erro=aplicar`);
    }
  }

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  const locale = await getLocale();
  redirect(
    `/${locale}/admin/ferramentas?aplicados=${toUpdate.length}&conflitos=${conflicts.length}`,
  );
}

// ── Regravar marca a partir da loja própria ───────────────────────
// Numa loja 'propria' a marca É a loja: o campo "marca" da fonte não é
// confiável (o vendor do Shopify da Japas traz o estilo da cerveja). O
// scraper já garante isso na coleta; este botão reaplica no que já está
// gravado — por exemplo depois de mudar o tipo de uma loja pra 'propria'.
//
// O canonical_slug é recalculado JUNTO, obrigatoriamente: ele deriva de
// marca+nome e é por ele que o scraper reconhece um produto existente.
// Corrigir a marca sem o slug faz a coleta seguinte criar uma duplicata de
// cada produto (aconteceu de verdade, ver supabase/scripts/fix-catalog-data.sql).
export async function rebrandOwnStoreProducts() {
  const supabase = await createClient();

  const { data: storesData } = await supabase
    .from("stores")
    .select("id, name, country")
    .eq("store_type", "propria");
  const stores = (storesData ?? []) as { id: string; name: string; country: string }[];

  const locale = await getLocale();
  if (stores.length === 0) redirect(`/${locale}/admin/ferramentas?remarcados=0`);

  // produto -> loja própria que o vende. Ordem determinística por nome de loja
  // pra o resultado não depender da ordem que o banco devolveu.
  const storeByProduct = new Map<string, { name: string; country: string }>();
  for (const store of [...stores].sort((a, b) => a.name.localeCompare(b.name))) {
    const { data: offersData } = await supabase
      .from("offers")
      .select("product_id")
      .eq("store_id", store.id);
    for (const o of (offersData ?? []) as { product_id: string }[]) {
      if (!storeByProduct.has(o.product_id)) {
        storeByProduct.set(o.product_id, { name: store.name, country: store.country });
      }
    }
  }

  const products = await fetchAllProducts(supabase);
  const changed: { id: string; brand: string; canonical_slug: string }[] = [];
  for (const p of products) {
    const store = storeByProduct.get(p.id);
    if (!store) continue;
    const slug = slugify(`${store.name} ${p.name}`);
    if (p.brand !== store.name || p.canonical_slug !== slug) {
      changed.push({ id: p.id, brand: store.name, canonical_slug: slug });
    }
  }

  // Slug é unique: se dois produtos convergirem, o upsert falha inteiro. Deixa
  // de fora os que colidem (com outro do lote ou com um produto intocado) e
  // reporta — mesmo princípio de applyReplacementsAction.
  const slugOwner = new Map<string, string>();
  for (const p of products) slugOwner.set(p.canonical_slug, p.id);
  const seen = new Map<string, string>();
  const safe: typeof changed = [];
  let skipped = 0;
  for (const c of changed) {
    const ownerId = slugOwner.get(c.canonical_slug);
    if ((ownerId && ownerId !== c.id) || seen.has(c.canonical_slug)) {
      skipped++;
      continue;
    }
    seen.set(c.canonical_slug, c.id);
    safe.push(c);
  }

  for (let i = 0; i < safe.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from("products")
      .upsert(safe.slice(i, i + BATCH_SIZE), { onConflict: "id" });
    if (error) redirect(`/${locale}/admin/ferramentas?erro=remarcar`);
  }

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(`/${locale}/admin/ferramentas?remarcados=${safe.length}&conflitos=${skipped}`);
}

// ── Mesclar dois produtos ─────────────────────────────────────────
// É o que faz as ofertas de lojas diferentes finalmente aparecerem numa página
// só. Chamada direto pelo client (não por <form>) pra devolver erro sem
// navegar — mesmo padrão de deleteOffers.
export async function mergeProducts(
  keepId: string,
  dropId: string,
): Promise<{ error: string | null }> {
  if (!keepId || !dropId || keepId === dropId) return { error: "ids inválidos" };

  const supabase = await createClient();

  const { data: keepOffers, error: keepErr } = await supabase
    .from("offers")
    .select("id, store_id, last_seen_at")
    .eq("product_id", keepId);
  if (keepErr) return { error: keepErr.message };

  const { data: dropOffers, error: dropErr } = await supabase
    .from("offers")
    .select("id, store_id, last_seen_at")
    .eq("product_id", dropId);
  if (dropErr) return { error: dropErr.message };

  // A decisão de quais ofertas mover e quais apagar é lógica pura, testada
  // isoladamente em lib/merge.ts.
  const { toMove, toDelete } = planMerge(
    (keepOffers ?? []) as MergeOffer[],
    (dropOffers ?? []) as MergeOffer[],
  );

  // Apaga primeiro: mover antes deixaria duas ofertas da mesma loja no mesmo
  // produto e violaria o unique.
  if (toDelete.length > 0) {
    const { error } = await supabase.from("offers").delete().in("id", toDelete);
    if (error) return { error: error.message };
  }

  if (toMove.length > 0) {
    const { error } = await supabase
      .from("offers")
      .update({ product_id: keepId, updated_at: new Date().toISOString() })
      .in("id", toMove);
    if (error) return { error: error.message };
  }

  // price_history segue a oferta (FK com cascade em offers), então não precisa
  // ser movido. O produto órfão sai por último: as FKs são RESTRICT de
  // propósito, então se sobrou oferta apontando pra ele o banco barra aqui em
  // vez de deixar dado inconsistente.
  const { error: delErr } = await supabase.from("products").delete().eq("id", dropId);
  if (delErr) return { error: delErr.message };

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  return { error: null };
}
