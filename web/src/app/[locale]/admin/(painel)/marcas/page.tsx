import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import Modal from "@/components/admin/Modal";
import DeleteButton from "@/components/admin/DeleteButton";
import { fetchProductsForBrandSync } from "@/lib/brandSync";
import BrandForm from "./BrandForm";
import { deleteBrand, applyBrandsToProducts, syncBrandsFromProductsAction } from "./actions";

export const dynamic = "force-dynamic";

type BrandRow = { id: string; name: string; country: string | null; created_at: string };
type AliasRow = { id: string; brand_id: string; alias: string; created_at: string };

export default async function MarcasPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    new?: string;
    erro?: string;
    criadas?: string;
    aplicados?: string;
    ressincronizados?: string;
    conflitos?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("admin.brands");
  const tCommon = await getTranslations("admin.common");

  const [{ data: brandsData }, { data: aliasesData }, products] = await Promise.all([
    supabase.from("brands").select("*").order("name"),
    supabase.from("brand_aliases").select("*").order("created_at"),
    fetchProductsForBrandSync(supabase),
  ]);

  const brands = (brandsData ?? []) as BrandRow[];
  const aliases = (aliasesData ?? []) as AliasRow[];
  const aliasesByBrand = new Map<string, AliasRow[]>();
  for (const a of aliases) {
    const list = aliasesByBrand.get(a.brand_id);
    if (list) list.push(a);
    else aliasesByBrand.set(a.brand_id, [a]);
  }

  // Quantos produtos usam hoje exatamente o nome canônico da marca — não
  // conta variações/aliases ainda não aplicados (ver botão "Aplicar catálogo
  // aos produtos"), é só um indicador de uso na tabela.
  const productCountByBrand = new Map<string, number>();
  for (const p of products) {
    if (!p.brand) continue;
    productCountByBrand.set(p.brand, (productCountByBrand.get(p.brand) ?? 0) + 1);
  }

  const editing = sp.edit ? brands.find((b) => b.id === sp.edit) : undefined;
  const showForm = Boolean(editing) || sp.new === "1";
  const closeHref = "/admin/marcas";

  const btnCls =
    "rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
  const okBanner =
    "rounded bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("pageTitle")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500 dark:text-neutral-400">{t("hint")}</p>
        </div>
        <Link
          href="/admin/marcas?new=1"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          + {tCommon("include")}
        </Link>
      </div>

      {sp.erro && !showForm && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("actionFailed")}
        </p>
      )}
      {sp.criadas !== undefined && (
        <p className={okBanner}>{t("syncResult", { count: Number(sp.criadas) })}</p>
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

      {showForm && (
        <Modal closeHref={closeHref}>
          <BrandForm
            editing={editing ? { id: editing.id, name: editing.name, country: editing.country } : undefined}
            aliases={editing ? aliasesByBrand.get(editing.id) : undefined}
            cancelHref={closeHref}
            erro={sp.erro}
          />
        </Modal>
      )}

      {/* ── Sincronizar com o catálogo de produtos ── */}
      <section className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-2">
        <div className="space-y-2">
          <div>
            <h2 className="font-medium">{t("syncTitle")}</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("syncHint")}</p>
          </div>
          <form action={syncBrandsFromProductsAction}>
            <button type="submit" className={btnCls}>
              {t("syncButton")}
            </button>
          </form>
        </div>
        <div className="space-y-2">
          <div>
            <h2 className="font-medium">{t("applyTitle")}</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("applyHint")}</p>
          </div>
          <form action={applyBrandsToProducts}>
            <button type="submit" className={btnCls}>
              {t("applyButton")}
            </button>
          </form>
        </div>
      </section>

      {/* ── Lista de marcas ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">{t("listTitle", { count: brands.length })}</h2>

        {brands.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
            {t("empty")}
          </p>
        ) : (
          // overflow-x-auto (não hidden) — ver comentário em StoresTable.tsx.
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-[13px]">
              <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("fieldName")}</th>
                  <th className="px-4 py-2 font-medium">{t("fieldCountry")}</th>
                  <th className="px-4 py-2 font-medium">{t("productsColumn")}</th>
                  <th className="px-4 py-2 font-medium">{t("aliasesColumn")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-4 py-2 font-medium">{b.name}</td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                      {b.country ?? t("countryUnknown")}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                      {productCountByBrand.get(b.name) ?? 0}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                      {aliasesByBrand.get(b.id)?.length ?? 0}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/marcas?edit=${b.id}`} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                          {t("edit")}
                        </Link>
                        <DeleteButton
                          action={deleteBrand}
                          id={b.id}
                          label={t("delete")}
                          confirmMessage={t("confirmDeleteBrand", { name: b.name })}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
