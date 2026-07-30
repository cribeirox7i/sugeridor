import { getTranslations } from "next-intl/server";
import type { Product, PriceHistoryPoint } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { dropPercentByOffer } from "@/lib/queries";
import PriceHistoryChart from "@/components/PriceHistoryChart";

type OfferRow = {
  id: string;
  price: number;
  currency: string;
  drop_percent: number | null;
  store: { name: string };
};

type ProductInfo = Pick<Product, "id" | "name" | "brand" | "attributes" | "image_url">;

// Renderização pura do detalhe de produto — sem I/O próprio, recebe os dados
// já prontos. Extraído de ProductDetail.tsx pra poder ser alimentado tanto
// pela versão com query (página cheia /produto/[slug]) quanto pela home, que
// já tem produto/ofertas/histórico em memória (ver page.tsx) e não precisa
// refazer as mesmas 3 consultas só pra abrir o popup.
export default async function ProductDetailView({
  product,
  offers,
  history,
}: {
  product: ProductInfo;
  offers: OfferRow[];
  history: PriceHistoryPoint[];
}) {
  const [t, tAttr, tOffer] = await Promise.all([
    getTranslations("product"),
    getTranslations("attributes"),
    getTranslations("offerCard"),
  ]);

  const currency = offers[0]?.currency ?? "BRL";
  const attrEntries = Object.entries(product.attributes ?? {});

  // Selo "-X%" vem da mesma coluna que a home usa (offers.drop_percent,
  // mantida por trigger — migration 0013), em vez de recalcular a partir da
  // série. `history` aqui serve só pro gráfico.
  const dropByOffer = dropPercentByOffer(offers);

  return (
    <div className="space-y-10">
      <div className="grid gap-8 md:grid-cols-[280px_1fr]">
        {/* Fundo branco FIXO (não dark:bg-*) — mesmo motivo de OfferCard.tsx:
            dá visual padrão pra imagem venha com fundo transparente ou
            branco embutido, nos dois temas. */}
        <div className="flex aspect-square items-center justify-center rounded-lg border border-neutral-200 bg-white dark:border-neutral-800">
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
  );
}
