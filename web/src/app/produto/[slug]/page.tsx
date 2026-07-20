import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProductBySlug,
  getActiveOffersForProduct,
  getPriceHistoryForProduct,
} from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import PriceHistoryChart from "@/components/PriceHistoryChart";

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

  const [offers, history] = await Promise.all([
    getActiveOffersForProduct(supabase, product.id),
    getPriceHistoryForProduct(supabase, product.id),
  ]);

  const currency = offers[0]?.currency ?? "BRL";
  const attrEntries = Object.entries(product.attributes ?? {});

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-100">
            ← Voltar ao catálogo
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          <div className="flex aspect-square items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900">
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
                    <dt className="text-neutral-500 capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd className="text-neutral-200">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Ofertas</h2>
          {offers.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhuma oferta ativa no momento.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900 text-left text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Loja</th>
                    <th className="px-4 py-2 font-medium">Preço</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id} className="border-t border-neutral-800">
                      <td className="px-4 py-2">{o.store.name}</td>
                      <td className="px-4 py-2 font-semibold text-amber-400">
                        {formatPrice(o.price, o.currency)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <a
                          href={`/go/${o.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-amber-500"
                        >
                          Ver oferta
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
          <h2 className="text-lg font-medium">Histórico de preço</h2>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <PriceHistoryChart points={history} currency={currency} />
          </div>
        </section>
      </div>
    </div>
  );
}
