import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/components/admin/DeleteButton";
import { STORE_COUNTRIES } from "@/lib/countries";
import {
  addBrand,
  updateBrand,
  deleteBrand,
  addBrandAlias,
  deleteBrandAlias,
  applyBrandsToProducts,
} from "./actions";

export const dynamic = "force-dynamic";

type BrandRow = { id: string; name: string; country: string | null; created_at: string };
type AliasRow = { id: string; brand_id: string; alias: string; created_at: string };

export default async function MarcasPage({
  searchParams,
}: {
  searchParams: Promise<{
    aplicados?: string;
    ressincronizados?: string;
    conflitos?: string;
    erro?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("admin.brands");

  const [{ data: brandsData }, { data: aliasesData }] = await Promise.all([
    supabase.from("brands").select("*").order("name"),
    supabase.from("brand_aliases").select("*").order("created_at"),
  ]);

  const brands = (brandsData ?? []) as BrandRow[];
  const aliases = (aliasesData ?? []) as AliasRow[];
  const aliasesByBrand = new Map<string, AliasRow[]>();
  for (const a of aliases) {
    const list = aliasesByBrand.get(a.brand_id);
    if (list) list.push(a);
    else aliasesByBrand.set(a.brand_id, [a]);
  }

  const inputCls =
    "rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const btnCls =
    "rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
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
      {sp.aplicados !== undefined && (
        <p className={okBanner}>
          {t("applyResult", {
            count: Number(sp.aplicados),
            resynced: Number(sp.ressincronizados ?? 0),
            conflicts: Number(sp.conflitos ?? 0),
          })}
        </p>
      )}

      {/* ── Aplicar aos produtos existentes ── */}
      <section className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium">{t("applyTitle")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("applyHint")}</p>
        </div>
        <form action={applyBrandsToProducts}>
          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {t("applyButton")}
          </button>
        </form>
      </section>

      {/* ── Cadastrar marca nova ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">{t("newBrandTitle")}</h2>
        <form action={addBrand} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{t("fieldName")}</span>
            <input name="name" required placeholder={t("namePlaceholder")} className={`${inputCls} w-56`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{t("fieldCountry")}</span>
            <select name="country" defaultValue="" className={`${inputCls} w-44`}>
              <option value="">{t("countryUnknown")}</option>
              {STORE_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {t("addBrand")}
          </button>
        </form>
      </section>

      {/* ── Lista de marcas ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">{t("listTitle", { count: brands.length })}</h2>

        {brands.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
            {t("empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {brands.map((b) => {
              const brandAliases = aliasesByBrand.get(b.id) ?? [];
              return (
                <div
                  key={b.id}
                  className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
                >
                  <form action={updateBrand} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-neutral-500">{t("fieldName")}</span>
                      <input name="name" defaultValue={b.name} required className={`${inputCls} w-56`} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-neutral-500">{t("fieldCountry")}</span>
                      <select name="country" defaultValue={b.country ?? ""} className={`${inputCls} w-44`}>
                        <option value="">{t("countryUnknown")}</option>
                        {STORE_COUNTRIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className={btnCls}>
                      {t("save")}
                    </button>
                    <DeleteButton
                      action={deleteBrand}
                      id={b.id}
                      label={t("delete")}
                      confirmMessage={t("confirmDeleteBrand", { name: b.name })}
                      className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                    />
                  </form>

                  <details className="rounded border border-neutral-200 dark:border-neutral-800">
                    <summary className="cursor-pointer px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300">
                      {t("aliasesTitle", { count: brandAliases.length })}
                    </summary>
                    <div className="space-y-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
                      {brandAliases.length === 0 ? (
                        <p className="text-xs text-neutral-500">{t("noAliases")}</p>
                      ) : (
                        <ul className="space-y-1">
                          {brandAliases.map((a) => (
                            <li
                              key={a.id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span className="min-w-0 truncate font-mono text-xs">{a.alias}</span>
                              <form action={deleteBrandAlias}>
                                <input type="hidden" name="id" value={a.id} />
                                <button
                                  type="submit"
                                  className="shrink-0 rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-800 dark:hover:text-red-400"
                                >
                                  ✕
                                </button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form action={addBrandAlias} className="flex gap-2">
                        <input type="hidden" name="brand_id" value={b.id} />
                        <input
                          name="alias"
                          placeholder={t("aliasPlaceholder")}
                          className={`${inputCls} flex-1`}
                        />
                        <button type="submit" className={btnCls}>
                          {t("addAlias")}
                        </button>
                      </form>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
