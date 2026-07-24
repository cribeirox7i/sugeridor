import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
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

export default async function OfertasPage() {
  const supabase = await createClient();
  const t = await getTranslations("admin.offers");

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
  const offers = (offersData ?? []) as unknown as OfferRow[];

  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const labelCls = "text-sm text-neutral-500 dark:text-neutral-400";
  const missingPrereq = products.length === 0 || stores.length === 0;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      {missingPrereq ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t("missingPrereq")}
        </p>
      ) : (
        <form
          action={saveOffer}
          className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900"
        >
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

          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {t("save")}
          </button>
        </form>
      )}

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
            {offers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  {t("empty")}
                </td>
              </tr>
            )}
            {offers.map((o) => (
              <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-4 py-2">
                  {o.product?.brand ? `${o.product.brand} — ${o.product.name}` : o.product?.name ?? "—"}
                </td>
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
                  <form action={deleteOffer}>
                    <input type="hidden" name="id" value={o.id} />
                    <button
                      type="submit"
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      {t("delete")}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
