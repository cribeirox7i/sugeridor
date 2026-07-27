"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";
import { normalizeDashes } from "@/lib/text";
import { prefixBrand, productSlug } from "@/lib/slug";
import { planReplacements, type ProductForReplace, type Replacement } from "@/lib/replacements";
import { planMerge, type MergeOffer } from "@/lib/merge";
import { patchProducts } from "@/lib/adminBatch";

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
  // NENHUM dos dois é trimado: o espaço é significativo nas duas pontas.
  // Em `search`, "Alemã " com espaço no fim é o que impede a regra de casar
  // "Alemãzinha". Em `replace`, o espaço à esquerda é o que permite separar
  // texto emendado — trocar "500 ml" por " 500 ml" conserta "Alma500 ml".
  const search = normalizeDashes((formData.get("search") as string) ?? "");
  const replace = normalizeDashes((formData.get("replace") as string) ?? "");
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

  // patchProducts monta a linha completa antes do upsert — upsert parcial
  // estoura os NOT NULL de products (ver web/src/lib/adminBatch.ts).
  const { error, updated } = await patchProducts(
    supabase,
    toUpdate.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      canonical_slug: p.canonical_slug,
    })),
  );
  const locale = await getLocale();
  if (error) redirect(`/${locale}/admin/ferramentas?erro=aplicar`);

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(`/${locale}/admin/ferramentas?aplicados=${updated}&conflitos=${conflicts.length}`);
}

// ── Regravar marca e nome a partir da loja própria ────────────────
// Duas coisas, porque nas lojas próprias as duas dependem da mesma fonte:
//
//  1. A marca É a loja (o apelido, se houver): o campo "marca" da fonte não é
//     confiável aí — o vendor do Shopify da Japas traz o estilo da cerveja.
//  2. O NOME ganha a marca na frente quando não a tem: o nome de um produto é
//     marca + descritivo. A Dogma chama sua cerveja de "IPA" porque no site
//     dela isso basta; num agregador o produto é "Dogma IPA", como
//     "Fanta Laranja" não é só "Laranja".
//
// Só lojas próprias: no marketplace a marca vem do vendor e traz razão social
// ("PAULANER BRAUEREI GRUPPE GMBH & CO. KGAA"), distribuidor ou placeholder
// ("MARCA PROPRIA"), e prefixar pioraria o nome.
//
// O canonical_slug é recalculado JUNTO, obrigatoriamente: ele deriva de
// marca+nome e é por ele que o scraper reconhece um produto existente.
// Corrigir sem o slug faz a coleta seguinte criar uma duplicata de cada
// produto (aconteceu de verdade, ver supabase/scripts/fix-catalog-data.sql).
export async function rebrandOwnStoreProducts() {
  const supabase = await createClient();

  const { data: storesData } = await supabase
    .from("stores")
    .select("id, name, brand_alias, country")
    .eq("store_type", "propria");
  const stores = (storesData ?? []) as {
    id: string;
    name: string;
    brand_alias: string | null;
    country: string;
  }[];

  const locale = await getLocale();
  if (stores.length === 0) redirect(`/${locale}/admin/ferramentas?remarcados=0`);

  // produto -> loja própria que o vende. Ordem determinística por nome de loja
  // pra o resultado não depender da ordem que o banco devolveu.
  const storeByProduct = new Map<string, { brand: string; country: string }>();
  for (const store of [...stores].sort((a, b) => a.name.localeCompare(b.name))) {
    const { data: offersData } = await supabase
      .from("offers")
      .select("product_id")
      .eq("store_id", store.id);
    for (const o of (offersData ?? []) as { product_id: string }[]) {
      if (!storeByProduct.has(o.product_id)) {
        storeByProduct.set(o.product_id, {
          brand: store.brand_alias || store.name,
          country: store.country,
        });
      }
    }
  }

  const products = await fetchAllProducts(supabase);
  const changed: { id: string; name: string; brand: string; canonical_slug: string }[] = [];
  for (const p of products) {
    const store = storeByProduct.get(p.id);
    if (!store) continue;
    // Mesmas funções que o scraper usa (espelhadas em scraper/normalize.py),
    // pra o resultado aqui e na coleta serem idênticos.
    const name = prefixBrand(p.name, store.brand);
    const slug = productSlug(store.brand, name);
    if (p.brand !== store.brand || p.name !== name || p.canonical_slug !== slug) {
      changed.push({ id: p.id, name, brand: store.brand, canonical_slug: slug });
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

  // patchProducts monta a linha completa antes do upsert — upsert parcial
  // estoura os NOT NULL de products. Foi exatamente aqui que a ação falhou na
  // primeira tentativa real (ver web/src/lib/adminBatch.ts).
  const { error, updated } = await patchProducts(supabase, safe);
  if (error) redirect(`/${locale}/admin/ferramentas?erro=remarcar`);

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(`/${locale}/admin/ferramentas?remarcados=${updated}&conflitos=${skipped}`);
}

// ── Ressincronizar identificadores (slug) ─────────────────────────
// O `canonical_slug` é a chave pela qual o scraper reconhece um produto que já
// existe. Quando a fórmula dele muda — foi o caso quando o nome passou a
// conter a marca e o slug deixou de repeti-la ("dogma-ipa" em vez de
// "dogma-dogma-ipa") — os slugs JÁ GRAVADOS ficam fora da fórmula nova, e a
// coleta seguinte não acha o produto: cria uma duplicata de cada um. Foram 717
// de 1109 produtos nessa situação.
//
// Esta ação recalcula o slug de TODO o catálogo (não só lojas próprias, porque
// o problema atinge qualquer produto cujo nome contenha a marca) e aplica onde
// não há colisão. Idempotente: rodar de novo não muda nada.
export async function resyncProductSlugs() {
  const supabase = await createClient();
  const products = await fetchAllProducts(supabase);
  const locale = await getLocale();

  const changed: { id: string; canonical_slug: string }[] = [];
  for (const p of products) {
    const slug = productSlug(p.brand, p.name);
    if (slug !== p.canonical_slug) changed.push({ id: p.id, canonical_slug: slug });
  }

  // Slug é unique: dois produtos convergindo derrubariam o lote inteiro. Deixa
  // de fora quem colide (com outro do lote ou com produto intocado) e reporta —
  // esses casos são duplicatas de verdade, resolvidas por mesclagem.
  const owner = new Map(products.map((p) => [p.canonical_slug, p.id]));
  const seen = new Map<string, string>();
  const safe: typeof changed = [];
  let skipped = 0;
  for (const c of changed) {
    const existing = owner.get(c.canonical_slug);
    if ((existing && existing !== c.id) || seen.has(c.canonical_slug)) {
      skipped++;
      continue;
    }
    seen.set(c.canonical_slug, c.id);
    safe.push(c);
  }

  const { error, updated } = await patchProducts(supabase, safe);
  if (error) redirect(`/${locale}/admin/ferramentas?erro=resync`);

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(`/${locale}/admin/ferramentas?ressincronizados=${updated}&conflitos=${skipped}`);
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
