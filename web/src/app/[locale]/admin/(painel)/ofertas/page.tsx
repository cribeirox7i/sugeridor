import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import Modal from "@/components/admin/Modal";
import DeleteButton from "@/components/admin/DeleteButton";
import ViewToggle from "@/components/admin/ViewToggle";
import SearchBox from "@/components/admin/SearchBox";
import { saveOffer, toggleOfferActive, deleteOffer } from "./actions";

export const dynamic = "force-dynamic";

type OfferRow = {
  id: string;
  price: number;
  currency: string;
  url: string;
  active: boolean;
  product: { name: string; brand: string | null } | null;
  store: { name: string } | null;
};

const brl = (v: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);

function offerLabel(o: OfferRow): string {
  return o.product?.brand ? `${o.product.brand} — ${o.product.name}` : o.product?.name ?? "";
}

export default async function OfertasPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; error?: string; q?: string; view?: string }>;
}) {
  const { new: isNew, error, q, view } = await searchParams;
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("admin.offers"),
    getTranslations("admin.common"),
  ]);

  const [{ data: productsData }, { data: storesData }, { data: offersData }] = await Promise.all([
    supabase.from("products").select("id, name, brand").order("name"),
    supabase.from("stores").select("id, name").order("name"),
    supabase
      .from("offers")
      .select("id, price, currency, url, active, product:products ( name, brand ), store:stores ( name )")
      .order("updated_at", { ascending: false }),
  ]);

  const products = (productsData ?? []) as { id: string; name: string; brand: string | null }[];
  const stores = (storesData ?? []) as { id: string; name: string }[];
  const allOffers = (offersData ?? []) as unknown as OfferRow[];
  const offers = q
    ? allOffers.filter(
        (o) =>
          offerLabel(o).toLowerCase().includes(q.toLowerCase()) ||
          (o.store?.name ?? "").toLowerCase().includes(q.toLowerCase()),
      )
    : allOffers;

  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const labelCls = "text-sm text-neutral-500 dark:text-neutral-400";
  const missingPrereq = products.length === 0 || stores.length === 0;
  const showForm = isNew === "1" && !missingPrereq;
  const isList = view === "list";

  const form = (
    <form action={saveOffer} className="space-y-4">
      <h2 className="font-medium">{t("newTitle")}</h2>
      <p className="text-xs text-neutral-500">{t("hint")}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={labelCls}>{t("product")}</span>
          <select name="product_id" required className={inputCls}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.brand ? `${p.brand} — ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelCls}>{t("store")}</span>
          <select name="store_id" required className={inputCls}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelCls}>{t("price")}</span>
          <input name="price" required inputMode="decimal" placeholder="0,00" className={inputCls} />
        </label>

        <label className="space-y-1">
          <span className={labelCls}>{t("currency")}</span>
          <input name="currency" defaultValue="BRL" className={inputCls} />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className={labelCls}>{t("url")}</span>
          <input name="url" type="url" required placeholder="https://..." className={inputCls} />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          {t("save")}
        </button>
        <Link
          href="/admin/ofertas"
          className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {t("cancel")}
        </Link>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {!missingPrereq && (
          <Link
            href="/admin/ofertas?new=1"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            + {tCommon("include")}
          </Link>
        )}
      </div>

      {!missingPrereq && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchBox placeholder={t("searchPlaceholder")} defaultValue={q} view={view} />
          <ViewToggle />
        </div>
      )}

      {missingPrereq && (
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t("missingPrereq")}
        </p>
      )}
      {error === "delete-blocked" && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("deleteBlocked")}
        </p>
      )}

      {showForm && <Modal closeHref="/admin/ofertas">{form}</Modal>}

      {offers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
          {t("empty")}
        </p>
      ) : isList ? (
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">{t("product")}</th>
                <th className="px-4 py-2 font-medium">{t("store")}</th>
                <th className="px-4 py-2 font-medium">{t("price")}</th>
                <th className="px-4 py-2 font-medium">{t("active")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-4 py-2">{offerLabel(o) || "—"}</td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{o.store?.name ?? "—"}</td>
                  <td className="px-4 py-2">{brl(o.price, o.currency)}</td>
                  <td className="px-4 py-2">
                    <form action={toggleOfferActive}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="active" value={String(o.active)} />
                      <button
                        type="submit"
                        className={
                          o.active
                            ? "rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/50 dark:text-green-300"
                            : "rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                        }
                      >
                        {o.active ? t("active") : t("inactive")}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeleteButton
                      action={deleteOffer}
                      id={o.id}
                      label={t("delete")}
                      confirmMessage={t("confirmDelete")}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((o) => (
            <div
              key={o.id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h3 className="text-sm font-medium leading-tight">{offerLabel(o) || "—"}</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{o.store?.name ?? "—"}</p>
              <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                {brl(o.price, o.currency)}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <form action={toggleOfferActive}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="active" value={String(o.active)} />
                  <button
                    type="submit"
                    className={
                      o.active
                        ? "rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/50 dark:text-green-300"
                        : "rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                    }
                  >
                    {o.active ? t("active") : t("inactive")}
                  </button>
                </form>
                <DeleteButton
                  action={deleteOffer}
                  id={o.id}
                  label={t("delete")}
                  confirmMessage={t("confirmDelete")}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
