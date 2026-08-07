"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";
import { normalizeDashes } from "@/lib/text";
import { prefixBrand, productSlug } from "@/lib/slug";
import { planReplacements, type Replacement } from "@/lib/replacements";
import { groupPairs } from "@/lib/duplicates";
import { planCountryRewrite, type ProductForCountry } from "@/lib/countryRules";
import { patchProducts } from "@/lib/adminBatch";
import {
  fetchAllProducts,
  mergeProductGroupsWith,
  resyncProductSlugsWith,
} from "@/lib/curation";
import { autoMergeDuplicatesIfEnabled, applyAllReplacements, mergeAllDuplicates } from "@/lib/postCollect";

// O PostgREST corta em 1000 linhas sem avisar; ler paginado é obrigatório
// (products já passou de 1000).
const PAGE_SIZE = 1000;

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

// As regras de país precisam de `attributes` (que ProductForReplace não traz).
// Paginado pelo mesmo motivo de sempre: o PostgREST corta em 1000 linhas sem
// avisar e `products` já passou disso.
async function fetchProductsForCountry(
  supabase: SupabaseLike,
): Promise<ProductForCountry[]> {
  const all: ProductForCountry[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, brand, attributes")
      .order("created_at")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as ProductForCountry[];
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

  // Se "mesclar automaticamente" está ligado em /admin/config, a regra que
  // acabou de ser aplicada pode ter criado duplicatas por nome (identificador
  // mudou) — mescla na hora em vez de deixar pra próxima coleta.
  const { ran, merged } = await autoMergeDuplicatesIfEnabled(supabase);

  // `conflicts.length` é de ANTES da mesclagem — se ela rodou, pode ter
  // resolvido exatamente esses conflitos, e mostrar o número velho na tela
  // ("existem N conflitos") sem nenhum grupo de fato pendente pra revisar era
  // a fonte da confusão: a lista abaixo já está limpa, mas o banner ainda
  // falava dos que acabaram de ser mesclados. Reconfere contra o catálogo
  // fresco só quando a mesclagem rodou — é o único caso em que o número pode
  // ter mudado.
  let remainingConflicts = conflicts.length;
  if (ran) {
    const freshProducts = await fetchAllProducts(supabase);
    remainingConflicts = planReplacements(freshProducts, rules).conflicts.length;
  }

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(
    `/${locale}/admin/ferramentas?aplicados=${updated}&conflitos=${remainingConflicts}&mesclados=${merged}`,
  );
}

// ── Aplicar TODAS as regras + mesclar de uma vez ──────────────────
// O botão por regra (acima) resolve uma correção pontual; este resolve o
// catálogo inteiro numa passada, pra não depender de clicar regra por regra
// toda vez que uma coleta termina. Reaproveita a MESMA sequência estagiada da
// automação pós-coleta (web/src/lib/postCollect.ts): aplica uma regra de cada
// vez, relendo o catálogo entre uma e outra — é isso que evita o problema do
// botão único antigo (aplicar tudo em bloco colidia tanto que não sobrava
// nada pra gravar, ver comentário de applyReplacementsAction). Sempre mescla
// as duplicatas resultantes no fim, INDEPENDENTE do toggle
// `auto_merge_duplicates` — quem clicou aqui já pediu pra resolver tudo agora.
export async function applyAllReplacementsAction() {
  const supabase = await createClient();
  const locale = await getLocale();

  const { rulesApplied, updated } = await applyAllReplacements(supabase);
  const { merged, failed } = await mergeAllDuplicates(supabase);
  // Ressincronizar é ESSENCIAL depois de mesclar — o sobrevivente pode ter
  // ficado com slug fora da fórmula atual, e a coleta seguinte duplicaria ele
  // de novo (mesmo motivo de runPostCollectionAutomation).
  const { updated: resynced, error: resyncError } = await resyncProductSlugsWith(supabase);
  if (resyncError) redirect(`/${locale}/admin/ferramentas?erro=aplicar`);

  const freshProducts = await fetchAllProducts(supabase);
  const { data: rulesData } = await supabase.from("text_replacements").select("*").eq("active", true);
  const remainingConflicts = planReplacements(
    freshProducts,
    (rulesData ?? []) as Replacement[],
  ).conflicts.length;

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(
    `/${locale}/admin/ferramentas?regrasAplicadas=${rulesApplied}&aplicados=${updated}&mesclados=${merged}&falhas=${failed}&ressincronizados=${resynced}&conflitos=${remainingConflicts}`,
  );
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
// produto -> marca/país da loja PRÓPRIA que o vende. Ordem determinística por
// nome de loja pra o resultado não depender da ordem que o banco devolveu (um
// produto vendido por duas lojas próprias é caso degenerado — vence a primeira
// alfabeticamente, sempre a mesma).
//
// Compartilhado por `rebrandOwnStoreProducts` (marca/nome/slug) e
// `rewriteProductCountries` (país): as duas ações precisam exatamente do mesmo
// mapa, e duplicá-lo faria uma divergir da outra silenciosamente.
async function ownStoreByProduct(
  supabase: SupabaseLike,
): Promise<Map<string, { brand: string; country: string }>> {
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

  const byProduct = new Map<string, { brand: string; country: string }>();
  for (const store of [...stores].sort((a, b) => a.name.localeCompare(b.name))) {
    const { data: offersData } = await supabase
      .from("offers")
      .select("product_id")
      .eq("store_id", store.id);
    for (const o of (offersData ?? []) as { product_id: string }[]) {
      if (!byProduct.has(o.product_id)) {
        byProduct.set(o.product_id, {
          brand: store.brand_alias || store.name,
          country: store.country,
        });
      }
    }
  }
  return byProduct;
}

export async function rebrandOwnStoreProducts() {
  const supabase = await createClient();
  const storeByProduct = await ownStoreByProduct(supabase);

  const locale = await getLocale();
  if (storeByProduct.size === 0) redirect(`/${locale}/admin/ferramentas?remarcados=0`);

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
//
// A lógica em si mora em lib/curation.ts (`resyncProductSlugsWith`) — isto é
// só um wrapper fino que resolve o cliente Supabase da sessão de admin e o
// redirect/getLocale, que só fazem sentido vindos de um clique no admin. A
// automação pós-coleta (web/src/lib/postCollect.ts) chama o núcleo direto,
// com um cliente de service_role key (sem sessão nenhuma).
export async function resyncProductSlugs() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { error, updated, skipped } = await resyncProductSlugsWith(supabase);
  if (error) redirect(`/${locale}/admin/ferramentas?erro=resync`);

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(`/${locale}/admin/ferramentas?ressincronizados=${updated}&conflitos=${skipped}`);
}

// ── Regravar países (duas regras) ─────────────────────────────────
// Traz pro admin, sob demanda, as duas regras de país que até agora só rodavam
// durante a coleta (scraper/enrich.py) — o que significava esperar a próxima
// execução do scraper pra corrigir o catálogo.
//
//   A. Loja própria é AUTORIDADE: sobrescreve o país dos produtos dela com o
//      país da loja. É o caso que motivou o pedido — uma loja mudou de
//      'marketplace' pra 'propria' e os produtos ficaram com o país da época de
//      marketplace, errado. Sobrescreve (a versão do scraper só completa o que
//      falta), igual ao que pipeline.py::_resolve_identity faz na coleta.
//      Idempotente: não precisa detectar "mudou de tipo", aplicar em todas as
//      próprias já resolve, e só gera patch quando o valor difere.
//   B. Completar pela marca: produto SEM país recebe o valor mais comum entre
//      produtos da mesma marca. Fill-only — é inferência, não autoridade.
//
// A antes de B (mesma ordem de run.py): A é autoridade e melhora o dado que B
// usa como base. Nenhuma das duas toca `canonical_slug` — país não entra na
// fórmula do slug, então não há o risco de dessincronização que cerca as outras
// ações desta tela.
export async function rewriteProductCountries() {
  const supabase = await createClient();
  const locale = await getLocale();

  const [storeByProduct, products] = await Promise.all([
    ownStoreByProduct(supabase),
    fetchProductsForCountry(supabase),
  ]);

  const countryByProduct = new Map<string, string>();
  for (const [productId, store] of storeByProduct) {
    if (store.country) countryByProduct.set(productId, store.country);
  }

  const { patches, ownStore, byBrand } = planCountryRewrite(products, countryByProduct);

  // patchProducts monta a linha COMPLETA antes do upsert: `attributes` já vai
  // mesclado por planCountryRewrite, e patch parcial estouraria os NOT NULL de
  // products (ver web/src/lib/adminBatch.ts).
  const { error } = await patchProducts(
    supabase,
    patches.map((p) => ({ id: p.id, attributes: p.attributes })),
  );
  if (error) redirect(`/${locale}/admin/ferramentas?erro=paises`);

  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(`/${locale}/admin/ferramentas?paisesLoja=${ownStore}&paisesMarca=${byBrand}`);
}

// ── Ignorar duplicata (o oposto de mesclar) ───────────────────────
// Marca os pares como "não são duplicata" e tira o grupo da lista PARA SEMPRE
// (tabela `ignored_duplicates`, migration 0017) — antes a decisão só existia no
// estado da tela e os 27 grupos reapareciam a cada recarregamento.
//
// Não toca em produto nem em oferta: os dois registros seguem separados, e o
// coletor continua gravando ponto de histórico só quando o preço muda. É por
// isso que ignorar é bem mais barato que mesclar em escrita de banco.
export async function ignoreDuplicateGroups(
  groups: string[][],
): Promise<{ ignored: number; error: string | null }> {
  const rows = groups
    .flatMap((ids) => groupPairs(ids.filter(Boolean)))
    .map(([a, b]) => ({ product_a_id: a, product_b_id: b }));
  if (rows.length === 0) return { ignored: 0, error: null };

  const supabase = await createClient();
  // `ignoreDuplicates: true` no upsert: reignorar um par já ignorado não é
  // erro, é no-op — o unique (a,b) da tabela é justamente o que garante isso.
  const { error } = await supabase
    .from("ignored_duplicates")
    .upsert(rows, { onConflict: "product_a_id,product_b_id", ignoreDuplicates: true });
  if (error) return { ignored: 0, error: error.message };

  revalidateAllLocales("/admin/ferramentas");
  return { ignored: groups.length, error: null };
}

// Volta a exibir um par ignorado. Existe porque ignorar é permanente: sem o
// desfazer, um clique errado esconderia uma duplicata real pra sempre.
export async function unignoreDuplicate(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("ignored_duplicates").delete().eq("id", id);
  revalidateAllLocales("/admin/ferramentas");
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
//
// A lógica em si mora em lib/curation.ts (`mergeProductGroupsWith`) — isto é
// só um wrapper fino que resolve o cliente Supabase da sessão de admin. A
// automação pós-coleta (web/src/lib/postCollect.ts) chama o núcleo direto,
// com um cliente de service_role key (sem sessão de admin nenhuma).
export async function mergeProductGroups(
  groups: string[][],
): Promise<{ mergedIndexes: number[]; failed: number; error: string | null }> {
  const supabase = await createClient();
  return mergeProductGroupsWith(supabase, groups);
}
