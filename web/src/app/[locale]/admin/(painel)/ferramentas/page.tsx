import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/components/admin/DeleteButton";
import {
  planReplacements,
  sortRules,
  type ProductForReplace,
  type Replacement,
} from "@/lib/replacements";
import { chooseKeeper, type MergeCandidate } from "@/lib/merge";
import { groupByName } from "@/lib/duplicates";
import { formatPrice } from "@/lib/format";
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
import ConflictList, { type ConflictGroup, type ConflictSide } from "./ConflictList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

// Produto com o que a tela precisa: identidade (pra planejar substituições e
// achar duplicatas) e o que decide qual lado de uma duplicata fica.
type ProductRow = ProductForReplace & {
  image_url: string | null;
  created_at: string;
};

type OfferRow = {
  product_id: string;
  price: number;
  currency: string;
  active: boolean;
  last_seen_at: string;
};

// Paginado: o PostgREST corta em 1000 linhas sem avisar e `products` já passou
// disso (1497 hoje).
async function allProducts(supabase: SupabaseLike): Promise<ProductRow[]> {
  const all: ProductRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabase
      .from("products")
      .select("id, name, brand, canonical_slug, image_url, created_at")
      .order("created_at")
      .range(from, from + PAGE_SIZE - 1);
    const page = (data ?? []) as ProductRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

// Também paginado, pelo mesmo motivo: são 896 ofertas hoje, e o corte
// silencioso a 1000 faria a contagem de ofertas por produto (que é o primeiro
// critério de quem fica numa mesclagem) ficar errada sem nenhum erro.
async function allOffers(supabase: SupabaseLike): Promise<OfferRow[]> {
  const all: OfferRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabase
      .from("offers")
      .select("product_id, price, currency, active, last_seen_at")
      .order("product_id")
      .range(from, from + PAGE_SIZE - 1);
    const page = (data ?? []) as OfferRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

type Stats = { offers: number; lastSeenAt: string | null; minPrice: number | null; currency: string };

function statsByProduct(offers: OfferRow[]): Map<string, Stats> {
  const map = new Map<string, Stats>();
  for (const o of offers) {
    const s = map.get(o.product_id) ?? { offers: 0, lastSeenAt: null, minPrice: null, currency: "BRL" };
    s.offers++;
    if (s.lastSeenAt === null || o.last_seen_at > s.lastSeenAt) s.lastSeenAt = o.last_seen_at;
    if (o.active && (s.minPrice === null || o.price < s.minPrice)) {
      s.minPrice = o.price;
      s.currency = o.currency;
    }
    map.set(o.product_id, s);
  }
  return map;
}

// Monta um grupo pra ConflictList, já com o lado mantido em primeiro — a MESMA
// decisão (chooseKeeper) que a Server Action reconfere, pra a tela não prometer
// manter um registro e o servidor manter outro.
function toGroup(key: string, produtos: ProductRow[], stats: Map<string, Stats>): ConflictGroup {
  const candidatos: (MergeCandidate & { row: ProductRow })[] = produtos.map((p) => {
    const s = stats.get(p.id);
    return {
      id: p.id,
      brand: p.brand,
      image_url: p.image_url,
      created_at: p.created_at,
      offers: s?.offers ?? 0,
      lastSeenAt: s?.lastSeenAt ?? null,
      row: p,
    };
  });

  const sides: ConflictSide[] = chooseKeeper(candidatos).map((c) => {
    const s = stats.get(c.id);
    return {
      id: c.id,
      name: c.row.name,
      brand: c.row.brand,
      offers: c.offers,
      hasImage: Boolean(c.row.image_url),
      priceLabel: s?.minPrice != null ? formatPrice(s.minPrice, s.currency) : null,
    };
  });

  return { key, sides };
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

  const [{ data: rulesData }, products, offers] = await Promise.all([
    supabase.from("text_replacements").select("*").order("created_at"),
    allProducts(supabase),
    allOffers(supabase),
  ]);

  const rules = sortRules((rulesData ?? []) as Replacement[]);
  const stats = statsByProduct(offers);
  const byId = new Map(products.map((p) => [p.id, p]));

  // Números POR REGRA, que é a unidade em que o usuário pensa e agora também a
  // unidade em que o botão age:
  //   afeta      — quantos produtos o texto casa (0 significa texto errado);
  //   aplicáveis — quantos dá pra gravar já, sem colidir com outro produto;
  //   conflitos  — quantos são duplicata e precisam de mesclagem primeiro.
  // Sem a separação entre os dois últimos, uma regra que casa 169 produtos e
  // não consegue gravar nenhum parecia simplesmente não funcionar.
  const perRule = new Map<string, { afeta: number; aplicaveis: number; conflitos: number }>();
  for (const rule of rules) {
    const plan = planReplacements(products, [{ ...rule, active: true }]);
    perRule.set(rule.id, {
      afeta: plan.toUpdate.length + plan.conflicts.length,
      aplicaveis: plan.toUpdate.length,
      conflitos: plan.conflicts.length,
    });
  }

  // ── Duplicatas que as substituições ativas criariam ──
  const activeRules = rules.filter((r) => r.active);
  const plan = activeRules.length
    ? planReplacements(products, activeRules)
    : { toUpdate: [], conflicts: [] };

  const vistos = new Set<string>();
  const gruposDeRegra: ConflictGroup[] = [];
  for (const c of plan.conflicts) {
    const ids = [c.result.id, ...c.conflictsWith].sort();
    const key = ids.join("|");
    if (vistos.has(key)) continue;
    vistos.add(key);
    const linhas = ids.map((id) => byId.get(id)).filter((p): p is ProductRow => !!p);
    if (linhas.length < 2) continue;
    gruposDeRegra.push(toGroup(key, linhas, stats));
  }

  // ── Duplicatas por nome, independentes de regra ──
  // Pega o produto que ficou com dois registros porque o IDENTIFICADOR mudou
  // (marca descoberta depois, nome corrigido à mão, fórmula do slug alterada) —
  // caso em que os dois aparecem no site, um deles sem marca, sem imagem e com o
  // preço da última coleta que o viu. Ver lib/duplicates.ts.
  const gruposPorNome = groupByName(products).map((grupo) =>
    toGroup(`nome:${grupo[0].id}`, grupo, stats),
  );

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
        <p className={okBanner}>
          {t("normalizeResult", {
            count: Number(sp.normalized),
            conflicts: Number(sp.conflitos ?? 0),
          })}
        </p>
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
        </div>
      </section>

      <ConflictList
        groups={gruposPorNome}
        title={t("nameDuplicatesTitle")}
        hint={t("nameDuplicatesHint")}
      />

      <ConflictList
        groups={gruposDeRegra}
        title={t("conflictsTitle")}
        hint={t("conflictsHint")}
      />

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
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
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
                  const n = perRule.get(rule.id) ?? { afeta: 0, aplicaveis: 0, conflitos: 0 };
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
                        {n.afeta === 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {t("affectsNothing")}
                          </span>
                        ) : (
                          <>
                            <span>{t("affectsCount", { count: n.afeta })}</span>
                            {/* O que dá pra gravar agora e o que depende de
                                mesclagem — a distinção que faltava. */}
                            <span className="block text-xs text-neutral-500">
                              {t("ruleBreakdown", {
                                appliable: n.aplicaveis,
                                conflicts: n.conflitos,
                              })}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {/* Aplicar é POR REGRA: o botão único que aplicava
                              todas juntas podia não ter nada seguro a gravar
                              (todo nome alterado colidindo com outro) e parecia
                              não funcionar, além de disparar correções que o
                              usuário não pediu naquele momento. */}
                          <form action={applyReplacementsAction}>
                            <input type="hidden" name="ruleId" value={rule.id} />
                            <button
                              type="submit"
                              disabled={!rule.active || n.aplicaveis === 0}
                              className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
                              title={n.aplicaveis === 0 ? t("applyRuleBlocked") : undefined}
                            >
                              {t("applyRule", { count: n.aplicaveis })}
                            </button>
                          </form>
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
