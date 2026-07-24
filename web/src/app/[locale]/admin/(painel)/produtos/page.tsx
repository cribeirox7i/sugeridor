import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Product, ProductType } from "@/lib/types";
import ProductForm from "./ProductForm";
import { deleteProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("admin.products");

  const [{ data: typesData }, { data: productsData }] = await Promise.all([
    supabase.from("product_types").select("*").order("name"),
    supabase
      .from("products")
      .select("*, product_type:product_types ( name )")
      .order("created_at", { ascending: false }),
  ]);

  const productTypes = (typesData ?? []) as ProductType[];
  const products = (productsData ?? []) as (Product & {
    product_type: { name: string } | null;
  })[];
  const editing = edit ? products.find((p) => p.id === edit) : undefined;

  if (productTypes.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t("noTypes")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      <ProductForm productTypes={productTypes} editing={editing} />

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">{t("nameColumn")}</th>
              <th className="px-4 py-2 font-medium">{t("brandColumn")}</th>
              <th className="px-4 py-2 font-medium">{t("typeColumn")}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                  {t("empty")}
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{p.brand ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                  {p.product_type?.name ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/produtos?edit=${p.id}`}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {t("edit")}
                    </Link>
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        {t("delete")}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
