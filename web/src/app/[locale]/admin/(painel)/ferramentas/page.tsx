import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/components/admin/DeleteButton";
import { planReplacements, applyReplacements, type ProductForReplace, type Replacement } from "@/lib/replacements";
import { normalizeExistingProductNames } from "../produtos/actions";
import { reclassifyExistingProducts } from "../classificacao/actions";
import {
  addReplacement,
  deleteReplacement,
  toggleReplacement,
  applyReplacementsAction,
  rebrandOwnStoreProducts,
  resyncProductSlugs,
} from "./actions";
import ConflictList, { type ConflictPair } from "./ConflictList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

// Paginado: o PostgREST corta em 1000 linhas sem avisar e `products` já passou
// disso (1113 hoje).
async function allProducts(supabase: SupabaseLike): Promise<ProductForReplace[]> {
  const all: ProductForReplace[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabase
      .from("products")
      .select("id, name, brand, canonical_slug")
      .order("created_at")
      .range(from, from + PAGE_SIZE - 1);
    const page = (data ?? []) as ProductForReplace[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

export default async function FerramentasPage({
  searchParams,
}: {
  searchParams: Promise<{
    aplicados?: string;
    remarcados?: string;
    ressincronizados?: string;
    conflitos?: string;
    normalized?: string;
    reclassified?: string;
    erro?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("admin.tools");

  const [{ data: rulesData }, products, { data: offerRows }] = await Promise.all([
    supabase.from("text_replacements").select("*").order("target").order("search"),
    allProducts(supabase),
    supabase.from("offers").select("product_id"),
  ]);

  const rules = (rulesData ?? []) as Replacement[];
  const activeRules = rules.filter((r) => r.active);

  // Quantos produtos cada regra afetaria — sem isso, uma regra que não casa
  // com nada (basta um ponto fora de lugar em "GMBH & CO. KGAA") parece
  // funcionar e silenciosamente não faz nada. Errar isso me custou uma
  // rodada de teste; o contador evita que aconteça com o usuário.
  const affectedByRule = new Map<string, number>();
  for (const rule of rules) {
    const n = applyReplacements(products, [{ ...rule, active: true }]).filter(
      (r) => r.changed,
    ).length;
    affectedByRule.set(rule.id, n);
  }

  const plan = activeRules.length
    ? planReplacements(products, activeRules)
    : { toUpdate: [], conflicts: [] };

  // Conflitos: pares que ficariam com o mesmo slug. Mantém como "A" o produto
  // mais antigo (a lista vem ordenada por created_at).
  const byId = new Map(products.map((p) => [p.id, p]));
  const offersByProduct = new Map<string, number>();
  for (const o of (offerRows ?? []) as { product_id: string }[]) {
    offersByProduct.set(o.product_id, (offersByProduct.get(o.product_id) ?? 0) + 1);
  }
  const seenPairs = new Set<string>();
  const conflicts: ConflictPair[] = [];
  for (const c of plan.conflicts) {
    for (const otherId of c.conflictsWith) {
      const key = [c.result.id, otherId].sort().join("|");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const a = byId.get(c.result.id);
      const b = byId.get(otherId);
      if (!a || !b) continue;
      conflicts.push({
        slug: `${key}`,
        keep: { id: b.id, name: b.name, brand: b.brand, offers: offersByProduct.get(b.id) ?? 0 },
        drop: { id: a.id, name: a.name, brand: a.brand, offers: offersByProduct.get(a.id) ?? 0 },
      });
    }
  }

  const btnCls =
    "rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
  const inputCls =
    "rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const okBanner =
    "rounded bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{t("pageTitle")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500 dark:text-neutral-400">{t("hint")}</p>
      </div>

      {sp.erro && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("actionFailed")}
        </p>
      )}
      {sp.normalized !== undefined && (
        <p className={okBanner}>{t("normalizeResult", { count: Number(sp.normalized) })}</p>
      )}
      {sp.reclassified !== undefined && (
        <p className={okBanner}>{t("reclassifyResult", { count: Number(sp.reclassified) })}</p>
      )}
      {sp.aplicados !== undefined && (
        <p className={okBanner}>
          {t("applyResult", {
            count: Number(sp.aplicados),
            conflicts: Number(sp.conflitos ?? 0),
          })}
        </p>
      )}
      {sp.ressincronizados !== undefined && (
        <p className={okBanner}>
          {t("resyncResult", {
            count: Number(sp.ressincronizados),
            conflicts: Number(sp.conflitos ?? 0),
          })}
        </p>
      )}
      {sp.remarcados !== undefined && (
        <p className={okBanner}>
          {t("rebrandResult", {
            count: Number(sp.remarcados),
            conflicts: Number(sp.conflitos ?? 0),
          })}
        </p>
      )}

      {/* ── Ações em lote ── */}
      <section className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium">{t("actionsTitle")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("actionsHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* returnTo mantém o usuário aqui: as duas ações também têm botão na
              tela de origem (Produtos e Classificação) e voltam pra lá. */}
          <form action={normalizeExistingProductNames}>
            <input type="hidden" name="returnTo" value="ferramentas" />
            <button type="submit" className={btnCls}>
              {t("normalizeNames")}
            </button>
          </form>
          <form action={reclassifyExistingProducts}>
            <input type="hidden" name="returnTo" value="ferramentas" />
            <button type="submit" className={btnCls}>
              {t("reclassify")}
            </button>
          </form>
          <form action={rebrandOwnStoreProducts}>
            <button type="submit" className={btnCls}>
              {t("rebrand")}
            </button>
          </form>
          <form action={resyncProductSlugs}>
            <button type="submit" className={btnCls}>
              {t("resync")}
            </button>
          </form>
          <form action={applyReplacementsAction}>
            <button
              type="submit"
              disabled={activeRules.length === 0}
              className={`${btnCls} disabled:opacity-50`}
            >
              {t("applyReplacements", { count: plan.toUpdate.length })}
            </button>
          </form>
        </div>
      </section>

      <ConflictList conflicts={conflicts} />

      {/* ── Regras de/para ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">{t("replacementsTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500 dark:text-neutral-400">
            {t("replacementsHint")}
          </p>
        </div>

        <form action={addReplacement} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{t("fieldTarget")}</span>
            <select name="target" defaultValue="name" className={inputCls}>
              <option value="name">{t("targetName")}</option>
              <option value="brand">{t("targetBrand")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{t("fieldSearch")}</span>
            <input name="search" placeholder={t("searchPlaceholder")} className={`${inputCls} w-64`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{t("fieldReplace")}</span>
            <input name="replace" placeholder={t("replacePlaceholder")} className={`${inputCls} w-48`} />
          </label>
          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {t("addRule")}
          </button>
        </form>

        {rules.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
            {t("noRules")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-[13px]">
              <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("fieldTarget")}</th>
                  <th className="px-4 py-2 font-medium">{t("fieldSearch")}</th>
                  <th className="px-4 py-2 font-medium">{t("fieldReplace")}</th>
                  <th className="px-4 py-2 font-medium">{t("colAffected")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const affected = affectedByRule.get(rule.id) ?? 0;
                  return (
                    <tr
                      key={rule.id}
                      className={`border-t border-neutral-200 dark:border-neutral-800 ${
                        rule.active ? "" : "opacity-50"
                      }`}
                    >
                      <td className="px-4 py-2 text-neutral-500">
                        {rule.target === "name" ? t("targetName") : t("targetBrand")}
                      </td>
                      <td className="px-4 py-2 font-mono">
                        &quot;{rule.search}&quot;
                      </td>
                      <td className="px-4 py-2 font-mono">
                        {rule.replace ? `"${rule.replace}"` : t("removes")}
                      </td>
                      <td className="px-4 py-2">
                        {affected === 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {t("affectsNothing")}
                          </span>
                        ) : (
                          t("affectsCount", { count: affected })
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <form action={toggleReplacement}>
                            <input type="hidden" name="id" value={rule.id} />
                            <input type="hidden" name="active" value={String(rule.active)} />
                            <button
                              type="submit"
                              className={
                                rule.active
                                  ? "rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/50 dark:text-green-300"
                                  : "rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                              }
                            >
                              {rule.active ? t("active") : t("inactive")}
                            </button>
                          </form>
                          <DeleteButton
                            action={deleteReplacement}
                            id={rule.id}
                            label="✕"
                            confirmMessage={t("confirmDeleteRule", { search: rule.search })}
                            className="rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-800 dark:hover:text-red-400"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
