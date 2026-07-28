"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";
import { normalizeDashes } from "@/lib/text";
import { prefixBrand, productSlug } from "@/lib/slug";
import { planReplacements, type ProductForReplace, type Replacement } from "@/lib/replacements";
import { chooseKeeper, planMerge, type MergeCandidate, type MergeOffer } from "@/lib/merge";
import { patchProducts } from "@/lib/adminBatch";

// O PostgREST corta em 1000 linhas sem avisar; ler paginado é obrigatório
// (products já passou de 1000).
const PAGE_SIZE = 1000;

// Ids por consulta: UUID é longo e uma cláusula in(...) com centenas deles gera
// URL que estoura limite de header (mesma cautela de queries.ts).
const ID_BATCH = 100;

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
  // Regra que não pode mudar nada: só espaço no DE (casa em todo nome e não
  // muda coisa alguma) ou DE igual ao PARA. Sem esta guarda a regra entra na
  // lista mostrando "afeta: nenhum produto" e fica pra sempre confundindo quem
  // olha a tela procurando por que o aplicar não faz nada.
  if (!search.trim() || search === replace) return;

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
// Aplica UMA regra por vez (`ruleId`), não o conjunto todo.
//
// O botão único que aplicava todas as regras ativas juntas parecia quebrado, e
// não estava: com quatro regras ativas no catálogo real, o plano combinado dava
// 0 produtos aplicáveis e 260 colisões — cada nome que mudaria virava duplicata
// de outro, então não havia nada seguro a gravar e o clique não fazia nada
// mesmo. Isoladas, as mesmas regras aplicam: separar o volume rendia 56
// produtos, remover " Garrafa " rendia 5. Além disso o usuário quase sempre
// quer resolver uma correção pontual, não disparar todas.
//
// Aplica só onde o slug resultante não colide com outro produto. Colisão
// significa "estes dois registros são o mesmo produto", e resolver isso move
// ofertas e apaga um produto — decisão do usuário (ver mergeProductGroups). Os
// conflitos voltam listados na própria tela.
export async function applyReplacementsAction(formData: FormData) {
  const ruleId = (formData?.get("ruleId") as string) || "";
  const supabase = await createClient();
  const [{ data: rulesData }, products] = await Promise.all([
    supabase.from("text_replacements").select("*").eq("active", true),
    fetchAllProducts(supabase),
  ]);

  const active = (rulesData ?? []) as Replacement[];
  // Sem ruleId não aplica nada: aplicar o conjunto todo de uma vez era
  // justamente o comportamento que confundia, e a tela só oferece o botão por
  // regra.
  const rules = ruleId ? active.filter((r) => r.id === ruleId) : [];
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

// ── Mesclar produtos duplicados ───────────────────────────────────
// É o que faz as ofertas de lojas diferentes finalmente aparecerem numa página
// só. Chamada direto pelo client (não por <form>) pra devolver erro sem
// navegar — mesmo padrão de deleteOffers.
//
// Recebe GRUPOS de ids, não pares, por dois motivos:
//
//  * em lote. Eram 219 pares a confirmar um por um na tela, o que na prática
//    inviabilizava resolver o catálogo. Um clique agora resolve a lista toda,
//    e um par que falhe não interrompe os outros (o relato diz quantos ficaram
//    de fora);
//  * um mesmo produto pode estar duplicado três vezes ou mais. Resolver por
//    pares independentes falharia no segundo par do grupo, que aponta pra um
//    produto que o primeiro já apagou — por isso o grupo é a unidade, e as
//    ofertas do produto mantido são reavaliadas depois de cada mesclagem.
//
// Quem fica é decidido por `chooseKeeper` (lib/merge.ts), a MESMA função que a
// tela usa pra mostrar o lado mantido, mas aqui reconferida com dados frescos.
// Devolve os ÍNDICES dos grupos resolvidos, não só a contagem: em lote o
// sucesso é parcial com frequência (uma oferta com disparo de alerta vinculado
// barra a exclusão daquele grupo e não afeta os outros), e sem saber QUAIS
// deram certo a tela só poderia adivinhar quais marcar como resolvidos.
export async function mergeProductGroups(
  groups: string[][],
): Promise<{ mergedIndexes: number[]; failed: number; error: string | null }> {
  const ids = [...new Set(groups.flat())].filter(Boolean);
  if (ids.length === 0) return { mergedIndexes: [], failed: 0, error: null };

  const supabase = await createClient();

  // Linhas dos envolvidos e as ofertas deles, em lotes (uma cláusula in(...)
  // com centenas de UUIDs gera URL que estoura limite de header — mesma
  // cautela de queries.ts).
  const products = new Map<string, MergeCandidate>();
  const offersByProduct = new Map<string, MergeOffer[]>();

  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const batch = ids.slice(i, i + ID_BATCH);
    const { data, error } = await supabase
      .from("products")
      .select("id, brand, image_url, created_at")
      .in("id", batch);
    if (error) return { mergedIndexes: [], failed: 0, error: error.message };
    for (const row of (data ?? []) as Omit<MergeCandidate, "offers" | "lastSeenAt">[]) {
      products.set(row.id, { ...row, offers: 0, lastSeenAt: null });
    }

    const { data: offerRows, error: offersErr } = await supabase
      .from("offers")
      .select("id, product_id, store_id, last_seen_at")
      .in("product_id", batch);
    if (offersErr) return { mergedIndexes: [], failed: 0, error: offersErr.message };
    for (const o of (offerRows ?? []) as (MergeOffer & { product_id: string })[]) {
      const list = offersByProduct.get(o.product_id);
      if (list) list.push(o);
      else offersByProduct.set(o.product_id, [o]);
    }
  }

  for (const [productId, list] of offersByProduct) {
    const p = products.get(productId);
    if (!p) continue;
    p.offers = list.length;
    p.lastSeenAt = list.reduce<string | null>(
      (max, o) => (max === null || o.last_seen_at > max ? o.last_seen_at : max),
      null,
    );
  }

  const now = new Date().toISOString();
  const mergedIndexes: number[] = [];
  let failed = 0;
  let firstError: string | null = null;

  for (const [index, group] of groups.entries()) {
    const candidates = group.map((id) => products.get(id)).filter((p): p is MergeCandidate => !!p);
    if (candidates.length < 2) {
      // Já resolvido numa chamada anterior (ou id inexistente): não é falha, e
      // marcar como resolvido é o que tira da tela um grupo que não existe mais.
      mergedIndexes.push(index);
      continue;
    }

    const [keep, ...drops] = chooseKeeper(candidates);
    // Um grupo só conta como resolvido se TODOS os descartes dele saíram — num
    // grupo de 3, resolver metade deixaria uma duplicata de pé.
    let groupOk = true;
    // Vai mudando conforme as ofertas migram: no grupo de 3+, o segundo
    // descarte precisa enxergar as ofertas que o primeiro já trouxe, senão o
    // planMerge não vê o conflito de loja e o unique (product_id, store_id)
    // estoura.
    let keepOffers = offersByProduct.get(keep.id) ?? [];

    for (const drop of drops) {
      const dropOffers = offersByProduct.get(drop.id) ?? [];
      // A decisão de quais ofertas mover e quais apagar é lógica pura, testada
      // isoladamente em lib/merge.ts.
      const { toMove, toDelete } = planMerge(keepOffers, dropOffers);

      // Apaga primeiro: mover antes deixaria duas ofertas da mesma loja no
      // mesmo produto e violaria o unique.
      //
      // Os três passos não são uma transação (são chamadas separadas ao
      // PostgREST): se o segundo falhar, o primeiro já aconteceu. Na prática o
      // que falha aqui é a exclusão de uma oferta com disparo de alerta
      // vinculado (FK sem cascade, de propósito), que é o PRIMEIRO passo — então
      // o grupo é reportado como não mesclado e nada foi tocado nele.
      if (toDelete.length > 0) {
        const { error } = await supabase.from("offers").delete().in("id", toDelete);
        if (error) {
          firstError ??= error.message;
          groupOk = false;
          break;
        }
      }

      if (toMove.length > 0) {
        const { error } = await supabase
          .from("offers")
          .update({ product_id: keep.id, updated_at: now })
          .in("id", toMove);
        if (error) {
          firstError ??= error.message;
          groupOk = false;
          break;
        }
      }

      // price_history segue a oferta (FK com cascade em offers), então não
      // precisa ser movido. O produto órfão sai por último: as FKs são RESTRICT
      // de propósito, então se sobrou oferta apontando pra ele o banco barra
      // aqui em vez de deixar dado inconsistente.
      const { error: delErr } = await supabase.from("products").delete().eq("id", drop.id);
      if (delErr) {
        firstError ??= delErr.message;
        groupOk = false;
        break;
      }

      // Estado do produto mantido depois desta mesclagem.
      const movedIds = new Set(toMove);
      const deletedIds = new Set(toDelete);
      keepOffers = [
        ...keepOffers.filter((o) => !deletedIds.has(o.id)),
        ...dropOffers.filter((o) => movedIds.has(o.id)),
      ];
      products.delete(drop.id);
    }

    if (groupOk) mergedIndexes.push(index);
    else failed++;
  }

  if (mergedIndexes.length > 0) {
    revalidateAllLocales("/admin/ferramentas");
    revalidateAllLocales("/admin/produtos");
    revalidateAllLocales("/");
  }
  return { mergedIndexes, failed, error: firstError };
}
