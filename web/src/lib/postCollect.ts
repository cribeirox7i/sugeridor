// Automação pós-coleta: aplicar as regras de/para ativas e mesclar duplicatas
// sozinho, na ordem substituição -> mesclagem -> ressincronização de slug.
//
// Antes disso era sempre manual (ver docs/04-conectores-ingestao.md e
// docs/05-roadmap.md): toda coleta nova, o usuário tinha que voltar em
// Ferramentas e clicar regra por regra + mesclar os grupos de novo. Dois
// toggles em `site_settings` (migration 0018) ligam isso: `auto_apply_replacements`
// e `auto_merge_duplicates`. Chamado pela rota `/api/admin/post-collect`, que o
// workflow do GitHub Actions aciona depois do job `enrich` — por isso usa um
// cliente com a service_role key (web/src/lib/supabase/serviceClient.ts): não
// há sessão de admin nesse contexto.
//
// Reaproveita a MESMA lógica que os botões manuais de Ferramentas usam
// (replacements.ts/duplicates.ts/merge.ts/curation.ts) — nada foi reescrito,
// então não há duas versões da regra de negócio pra dessincronizar (já
// aconteceu 3x neste projeto entre Python e TS: fórmula do slug, separação de
// medida, comparação de marca).
import type { SupabaseClient } from "@supabase/supabase-js";
import { planReplacements, sortRules, type Replacement } from "./replacements";
import { groupByName, isGroupIgnored, pairKey } from "./duplicates";
import { patchProducts } from "./adminBatch";
import { fetchAllProducts, mergeProductGroupsWith, resyncProductSlugsWith } from "./curation";

async function fetchIgnoredPairs(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("ignored_duplicates")
    .select("product_a_id, product_b_id");
  // Tolerante a erro (ex: migration 0017 ainda não rodou nesse ambiente) —
  // mesmo espírito de getSiteSettings: automação não deve quebrar por uma
  // tabela opcional, só roda sem o filtro de ignorados.
  if (error) return new Set();
  return new Set(
    ((data ?? []) as { product_a_id: string; product_b_id: string }[]).map((r) =>
      pairKey(r.product_a_id, r.product_b_id),
    ),
  );
}

// Aplica TODAS as regras ativas, uma de cada vez e na mesma ordem que a tela
// mostra (sortRules) — não em bloco. É a mesma razão do botão manual ser por
// regra (ver applyReplacementsAction): aplicar o conjunto todo de uma vez pode
// dar zero aplicáveis quando as regras colidem entre si, mas isoladas cada uma
// aplica o que é seguro. Refaz a leitura do catálogo entre uma regra e outra
// porque a regra seguinte precisa enxergar o que a anterior já gravou (é o que
// clicar os botões em sequência já fazia manualmente).
async function applyAllReplacements(
  supabase: SupabaseClient,
): Promise<{ rulesApplied: number; updated: number; conflicts: number }> {
  const { data: rulesData, error } = await supabase
    .from("text_replacements")
    .select("*")
    .eq("active", true);
  if (error) throw new Error(error.message);

  const rules = sortRules((rulesData ?? []) as Replacement[]);
  let rulesApplied = 0;
  let updated = 0;
  let conflicts = 0;

  for (const rule of rules) {
    const products = await fetchAllProducts(supabase);
    const plan = planReplacements(products, [rule]);
    conflicts += plan.conflicts.length;
    if (plan.toUpdate.length === 0) continue;

    const { error: patchError, updated: rowsUpdated } = await patchProducts(
      supabase,
      plan.toUpdate.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        canonical_slug: p.canonical_slug,
      })),
    );
    if (patchError) throw new Error(patchError);
    updated += rowsUpdated;
    rulesApplied++;
  }

  return { rulesApplied, updated, conflicts };
}

// Reconstrói as MESMAS duas listas de duplicatas que a tela de Ferramentas
// mostra (por nome, e as que as regras ativas ainda colidiriam depois do passo
// acima) e mescla todos os grupos que não foram marcados como "ignorar" —
// automatizando exatamente o que o clique em "Mesclar" faz em lote, sem regra
// nova nenhuma.
export async function mergeAllDuplicates(
  supabase: SupabaseClient,
): Promise<{ merged: number; failed: number }> {
  const [products, ignoredPairs, { data: rulesData, error: rulesErr }] = await Promise.all([
    fetchAllProducts(supabase),
    fetchIgnoredPairs(supabase),
    supabase.from("text_replacements").select("*").eq("active", true),
  ]);
  if (rulesErr) throw new Error(rulesErr.message);

  const activeRules = sortRules((rulesData ?? []) as Replacement[]);
  const plan = activeRules.length ? planReplacements(products, activeRules) : { toUpdate: [], conflicts: [] };

  const seen = new Set<string>();
  const groups: string[][] = [];

  for (const c of plan.conflicts) {
    const ids = [c.result.id, ...c.conflictsWith].sort();
    const key = ids.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (isGroupIgnored(ids, ignoredPairs)) continue;
    groups.push(ids);
  }

  for (const grupo of groupByName(products)) {
    const ids = grupo.map((p) => p.id);
    if (isGroupIgnored(ids, ignoredPairs)) continue;
    groups.push(ids);
  }

  if (groups.length === 0) return { merged: 0, failed: 0 };

  const { mergedIndexes, failed, error } = await mergeProductGroupsWith(supabase, groups);
  if (error) throw new Error(error);
  return { merged: mergedIndexes.length, failed };
}

// Mesma automação de `auto_merge_duplicates`, mas disparada NA HORA a partir
// de uma ação manual da tela de Ferramentas (ex: aplicar uma regra de/para),
// em vez de esperar a próxima coleta. Sem isto, ligar o toggle não bastava:
// aplicar uma regra manualmente criava duplicata por nome na hora, e ela só
// era mesclada sozinha depois da próxima chamada a /api/admin/post-collect —
// confuso pra quem via o toggle ligado e a lista de Ferramentas cheia mesmo
// assim. Usa o cliente de sessão do admin (RLS normal), não a service_role
// key — quem chama já está autenticado como admin.
export async function autoMergeDuplicatesIfEnabled(
  supabase: SupabaseClient,
): Promise<{ ran: boolean; merged: number; failed: number; slugsResynced: number }> {
  const { data: settings, error: settingsError } = await supabase
    .from("site_settings")
    .select("auto_merge_duplicates")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError || !settings?.auto_merge_duplicates) {
    return { ran: false, merged: 0, failed: 0, slugsResynced: 0 };
  }

  const { merged, failed } = await mergeAllDuplicates(supabase);
  // Mesma razão do bloco em runPostCollectionAutomation: o sobrevivente de um
  // grupo mesclado por nome pode ter ficado com slug fora da fórmula atual.
  const { updated: slugsResynced, error: resyncError } = await resyncProductSlugsWith(supabase);
  if (resyncError) throw new Error(resyncError);
  return { ran: true, merged, failed, slugsResynced };
}

export type PostCollectResult = {
  ranReplacements: boolean;
  ranMerge: boolean;
  rulesApplied: number;
  productsUpdated: number;
  remainingConflicts: number;
  groupsMerged: number;
  groupsFailed: number;
  slugsResynced: number;
  changed: boolean;
};

export async function runPostCollectionAutomation(
  supabase: SupabaseClient,
): Promise<PostCollectResult> {
  const { data: settings, error: settingsError } = await supabase
    .from("site_settings")
    .select("auto_apply_replacements, auto_merge_duplicates")
    .eq("id", 1)
    .maybeSingle();

  // Migration 0018 ainda não rodou nesse ambiente, ou falha de leitura: não
  // arrisca automação nenhuma (mesmo espírito de getSiteSettings em queries.ts
  // — coluna ausente não deve quebrar nem agir sem o parâmetro existir).
  const autoApplyReplacements = !settingsError && Boolean(settings?.auto_apply_replacements);
  const autoMergeDuplicates = !settingsError && Boolean(settings?.auto_merge_duplicates);

  const result: PostCollectResult = {
    ranReplacements: false,
    ranMerge: false,
    rulesApplied: 0,
    productsUpdated: 0,
    remainingConflicts: 0,
    groupsMerged: 0,
    groupsFailed: 0,
    slugsResynced: 0,
    changed: false,
  };

  if (autoApplyReplacements) {
    const { rulesApplied, updated, conflicts } = await applyAllReplacements(supabase);
    result.ranReplacements = true;
    result.rulesApplied = rulesApplied;
    result.productsUpdated = updated;
    result.remainingConflicts = conflicts;
    if (updated > 0) result.changed = true;
  }

  if (autoMergeDuplicates) {
    const { merged, failed } = await mergeAllDuplicates(supabase);
    result.ranMerge = true;
    result.groupsMerged = merged;
    result.groupsFailed = failed;
    if (merged > 0) result.changed = true;

    // Ressincronizar é ESSENCIAL depois de mesclar, não opcional: o
    // sobrevivente de um grupo mesclado por nome pode ter ficado com um slug
    // ANTIGO (fora da fórmula atual), e a coleta seguinte criaria uma
    // duplicata dele de novo — ver "Trabalho no admin" em docs/05-roadmap.md.
    // Idempotente e barato o bastante pra rodar mesmo quando nada foi
    // mesclado nesta execução (pega deriva de qualquer origem).
    const { updated: resynced, error: resyncError } = await resyncProductSlugsWith(supabase);
    if (resyncError) throw new Error(resyncError);
    result.slugsResynced = resynced;
    if (resynced > 0) result.changed = true;
  }

  return result;
}
