import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Product, ProductType } from "@/lib/types";
import Modal from "@/components/admin/Modal";
import ProductForm from "./ProductForm";
import { deleteProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  const { edit, new: isNew } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("admin.products");
  const tCommon = await getTranslations("admin.common");

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
  const showForm = Boolean(editing) || isNew === "1";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Link
          href="/admin/produtos?new=1"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          + {tCommon("include")}
        </Link>
      </div>

      {showForm && (
        <Modal closeHref="/admin/produtos">
          <ProductForm productTypes={productTypes} editing={editing} />
        </Modal>
      )}

      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
          {t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex aspect-square items-center justify-center bg-neutral-50 dark:bg-neutral-950">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-3xl">🍺</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                {p.brand && (
                  <p className="text-xs uppercase tracking-wide text-neutral-500">{p.brand}</p>
                )}
                <h3 className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {p.product_type?.name ?? "—"}
                </p>
                <div className="mt-auto flex gap-2 pt-2">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
