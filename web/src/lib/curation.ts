// Núcleo de duas ações de curadoria do catálogo (ressincronizar slug e
// mesclar duplicatas) que precisa rodar tanto a partir de um clique no admin
// (Server Action com sessão de admin, cookie) quanto da automação pós-coleta
// (web/src/lib/postCollect.ts, sem sessão nenhuma — usa a service_role key,
// ver web/src/lib/supabase/serviceClient.ts). Por isso recebe o cliente
// Supabase como parâmetro em vez de criar o seu: quem chama decide qual usar.
// As Server Actions em ferramentas/actions.ts são wrappers finos em cima
// destas duas funções.
import type { SupabaseClient } from "@supabase/supabase-js";
import { productSlug } from "./slug";
import { type ProductForReplace } from "./replacements";
import { chooseKeeper, planMerge, type MergeCandidate, type MergeOffer } from "./merge";
import { patchProducts } from "./adminBatch";
import { revalidateAllLocales } from "./revalidate";

// PostgREST corta em 1000 linhas sem avisar; ler paginado é obrigatório
// (products já passou de 1000).
const PAGE_SIZE = 1000;

// Ids por consulta: UUID é longo e uma cláusula in(...) com centenas deles gera
// URL que estoura limite de header (mesma cautela de queries.ts).
const ID_BATCH = 100;

export async function fetchAllProducts(supabase: SupabaseClient): Promise<ProductForReplace[]> {
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

// ── Ressincronizar identificadores (slug) ─────────────────────────
// O `canonical_slug` é a chave pela qual o scraper reconhece um produto que já
// existe. Quando a fórmula dele muda — foi o caso quando o nome passou a
// conter a marca e o slug deixou de repeti-la ("dogma-ipa" em vez de
// "dogma-dogma-ipa") — os slugs JÁ GRAVADOS ficam fora da fórmula nova, e a
// coleta seguinte não acha o produto: cria uma duplicata de cada um. Foram 717
// de 1109 produtos nessa situação.
//
// Recalcula o slug de TODO o catálogo (não só lojas próprias, porque o
// problema atinge qualquer produto cujo nome contenha a marca) e aplica onde
// não há colisão. Idempotente: rodar de novo não muda nada — é o que permite
// chamar isto sempre que a automação mescla duplicatas, mesmo sem saber se
// algo de fato ficou dessincronizado.
export async function resyncProductSlugsWith(
  supabase: SupabaseClient,
): Promise<{ updated: number; skipped: number; error: string | null }> {
  const products = await fetchAllProducts(supabase);

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
  return { updated, skipped, error };
}

// ── Mesclar produtos duplicados ───────────────────────────────────
// É o que faz as ofertas de lojas diferentes finalmente aparecerem numa página
// só.
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
// deram certo quem chama só poderia adivinhar quais marcar como resolvidos.
export async function mergeProductGroupsWith(
  supabase: SupabaseClient,
  groups: string[][],
): Promise<{ mergedIndexes: number[]; failed: number; error: string | null }> {
  const ids = [...new Set(groups.flat())].filter(Boolean);
  if (ids.length === 0) return { mergedIndexes: [], failed: 0, error: null };

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
  // Imagem do lado descartado, quando o mantido não tem nenhuma — chooseKeeper
  // agora prioriza o produto mais ANTIGO (ver lib/merge.ts), que pode muito bem
  // ser o lado incompleto de uma dupla antiga. Sem isto, mesclar apagaria a
  // única imagem do grupo pra sempre; um patch em lote no fim, não um update
  // por grupo.
  const imagePatches: { id: string; image_url: string }[] = [];
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
    if (!keep.image_url) {
      const withImage = drops.find((d) => d.image_url);
      if (withImage?.image_url) imagePatches.push({ id: keep.id, image_url: withImage.image_url });
    }
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

  // Só as linhas que sobreviveram até aqui (um grupo que falhou no meio pode
  // ter deixado `keep` intocado, mas o patch é inofensivo mesmo assim).
  if (imagePatches.length > 0) {
    await patchProducts(supabase, imagePatches);
  }

  if (mergedIndexes.length > 0) {
    revalidateAllLocales("/admin/ferramentas");
    revalidateAllLocales("/admin/produtos");
    revalidateAllLocales("/");
  }
  return { mergedIndexes, failed, error: firstError };
}
