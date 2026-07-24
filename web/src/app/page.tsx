import { createClient } from "@/lib/supabase/server";
import { listOffers, distinctAttributeValues, listStoresLite } from "@/lib/queries";
import OfferCard from "@/components/OfferCard";
import FilterBar from "@/components/FilterBar";
import ThemeToggle from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

function toNumber(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    estilo?: string;
    pais?: string;
    loja?: string;
    min?: string;
    max?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const filters = {
    estilo: sp.estilo || undefined,
    pais: sp.pais || undefined,
    storeId: sp.loja || undefined,
    precoMin: toNumber(sp.min),
    precoMax: toNumber(sp.max),
  };

  const [offers, estilos, paises, stores] = await Promise.all([
    listOffers(supabase, filters),
    distinctAttributeValues(supabase, "estilo"),
    distinctAttributeValues(supabase, "pais"),
    listStoresLite(supabase),
  ]);

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-start justify-between px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold">Sugeridor</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Ofertas de cervejas artesanais e especiais, reunidas de várias lojas.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        <FilterBar
          estilos={estilos}
          paises={paises}
          stores={stores}
          current={{
            estilo: sp.estilo,
            pais: sp.pais,
            storeId: sp.loja,
            precoMin: sp.min,
            precoMax: sp.max,
          }}
        />

        <p className="text-sm text-neutral-500 dark:text-neutral-500">
          {offers.length} {offers.length === 1 ? "oferta" : "ofertas"}
        </p>

        {offers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-neutral-800">
            Nenhuma oferta encontrada.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
