import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProductBySlug,
  getActiveOffersForProduct,
  getPriceHistoryForProduct,
  getPriceHistoryForOffers,
  computeFeaturedDeals,
} from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";

export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const product = await getProductBySlug(supabase, slug);
  if (!product) notFound();

  const [offers, history, t, tAttr, tOffer] = await Promise.all([
    getActiveOffersForProduct(supabase, product.id),
    getPriceHistoryForProduct(supabase, product.id),
    getTranslations("product"),
    getTranslations("attributes"),
    getTranslations("offerCard"),
  ]);

  const currency = offers[0]?.currency ?? "BRL";
  const attrEntries = Object.entries(product.attributes ?? {});

  // Mesmo cálculo de selo "-X%" da home, aplicado às ofertas ativas deste produto.
  const historyByOffer = await getPriceHistoryForOffers(
    supabase,
    offers.map((o) => o.id),
  );
  const dropByOffer = new Map(
    computeFeaturedDeals(offers, historyByOffer, offers.length).map((d) => [d.id, d.dropPercent]),
  );

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link
            href="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {t("backToCatalog")}
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 space-y-10 px-6 py-8">
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          <div className="flex aspect-square items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt={product.name} className="h-full w-full object-contain p-4" />
            ) : (
              <span className="text-6xl">🍺</span>
            )}
          </div>

          <div className="space-y-4">
            {product.brand && (
              <p className="text-sm uppercase tracking-wide text-neutral-500">{product.brand}</p>
            )}
            <h1 className="text-2xl font-semibold">{product.name}</h1>

            {attrEntries.length > 0 && (
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                {attrEntries.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-neutral-500">
                      {tAttr.has(k) ? tAttr(k) : k.replace(/_/g, " ")}
                    </dt>
                    <dd className="text-neutral-800 dark:text-neutral-200">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t("offersTitle")}</h2>
          {offers.length === 0 ? (
            <p className="text-sm text-neutral-500">{t("noActiveOffers")}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t("storeColumn")}</th>
                    <th className="px-4 py-2 font-medium">{t("priceColumn")}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="px-4 py-2">{o.store.name}</td>
                      <td className="px-4 py-2">
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {formatPrice(o.price, o.currency)}
                        </span>
                        {dropByOffer.has(o.id) && (
                          <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                            -{Math.round(dropByOffer.get(o.id)!)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <a
                          href={`/go/${o.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
                        >
                          {tOffer("viewOffer")}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t("historyTitle")}</h2>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <PriceHistoryChart points={history} currency={currency} />
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
