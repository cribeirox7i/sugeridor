import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  listOffers,
  distinctAttributeValues,
  listStoresLite,
  getFeaturedDeals,
  getPriceHistoryForOffers,
  getSiteSettings,
  getStoreById,
  computeFeaturedDeals,
} from "@/lib/queries";
import OfferCard from "@/components/OfferCard";
import FilterBar from "@/components/FilterBar";
import FiltersAccordion from "@/components/FiltersAccordion";
import FeaturedDeals from "@/components/FeaturedDeals";
import StoreCarousel from "@/components/StoreCarousel";
import StoreHeader from "@/components/StoreHeader";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import Modal from "@/components/admin/Modal";
import ProductDetail from "@/components/ProductDetail";

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
    produto?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("home");

  const filters = {
    estilo: sp.estilo || undefined,
    pais: sp.pais || undefined,
    storeId: sp.loja || undefined,
    precoMin: toNumber(sp.min),
    precoMax: toNumber(sp.max),
  };

  // Fechar o popup do produto volta pros mesmos filtros ativos, sem o ?produto=.
  const closeParams = new URLSearchParams();
  if (sp.estilo) closeParams.set("estilo", sp.estilo);
  if (sp.pais) closeParams.set("pais", sp.pais);
  if (sp.loja) closeParams.set("loja", sp.loja);
  if (sp.min) closeParams.set("min", sp.min);
  if (sp.max) closeParams.set("max", sp.max);
  const closeHref = closeParams.toString() ? `/?${closeParams.toString()}` : "/";
  const storeMode = Boolean(filters.storeId);

  const [offers, estilos, paises, stores, featuredDeals, siteSettings, storeDetail] =
    await Promise.all([
      listOffers(supabase, filters),
      distinctAttributeValues(supabase, "estilo"),
      distinctAttributeValues(supabase, "pais"),
      listStoresLite(supabase),
      storeMode ? Promise.resolve([]) : getFeaturedDeals(supabase),
      getSiteSettings(supabase),
      storeMode ? getStoreById(supabase, filters.storeId!) : Promise.resolve(null),
    ]);

  // Histórico de todas as ofertas visíveis, numa query só (evita N+1 por card).
  const historyByOffer = await getPriceHistoryForOffers(
    supabase,
    offers.map((o) => o.id),
  );

  // Selo "-X%" por card: mesma lógica de queda do carrossel de destaques,
  // sem limite, pra cobrir qualquer oferta com queda real (não só o top 5).
  const dropByOffer = new Map(
    computeFeaturedDeals(offers, historyByOffer, offers.length).map((d) => [d.id, d.dropPercent]),
  );

  // Lojas do carrossel: as que têm oferta ativa na listagem geral (sem
  // filtro de loja) — deriva do próprio array de ofertas, sem query nova.
  const storesWithOffers = storeMode
    ? []
    : [...new Map(offers.map((o) => [o.store.id, o.store])).values()];

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-start justify-between px-6 py-6">
          <div>
            <Logo settings={siteSettings} fallbackText={t("title")} className="h-8" />
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6">
        {storeMode ? (
          <StoreHeader store={storeDetail} />
        ) : (
          <>
            <FeaturedDeals deals={featuredDeals} />

            <StoreCarousel stores={storesWithOffers} />

            <FiltersAccordion
              activeCount={Object.values(filters).filter((v) => v !== undefined).length}
            >
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
            </FiltersAccordion>
          </>
        )}

        <p className="text-sm text-neutral-500 dark:text-neutral-500">
          {t("offerCount", { count: offers.length })}
        </p>

        {offers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-neutral-800">
            {t("noOffers")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} dropPercent={dropByOffer.get(offer.id)} />
            ))}
          </div>
        )}
      </div>

      {sp.produto && (
        <Modal closeHref={closeHref}>
          <ProductDetail slug={sp.produto} />
        </Modal>
      )}

      <Footer />
    </div>
  );
}
