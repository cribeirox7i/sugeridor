import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  listOffers,
  filterOffers,
  sortOffers,
  distinctAttributeValues,
  storesWithActiveOffers,
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
    q?: string;
    ordenar?: string;
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
    q: sp.q || undefined,
  };
  const sort = (sp.ordenar as "preco" | "nome" | "pais" | undefined) || undefined;

  // Fechar o popup do produto volta pros mesmos filtros ativos, sem o ?produto=.
  const closeParams = new URLSearchParams();
  if (sp.estilo) closeParams.set("estilo", sp.estilo);
  if (sp.pais) closeParams.set("pais", sp.pais);
  if (sp.loja) closeParams.set("loja", sp.loja);
  if (sp.min) closeParams.set("min", sp.min);
  if (sp.max) closeParams.set("max", sp.max);
  if (sp.q) closeParams.set("q", sp.q);
  if (sp.ordenar) closeParams.set("ordenar", sp.ordenar);
  const closeHref = closeParams.toString() ? `/?${closeParams.toString()}` : "/";
  const storeMode = Boolean(filters.storeId);

  // Uma única busca de TODAS as ofertas ativas (categorias públicas) reaproveitada
  // pra grid, facetas de filtro e destaques — em vez de uma query por consumidor
  // (era o que deixava a home, e por tabela o popup de produto que renderiza a
  // mesma página por trás, lenta: até 7 idas ao banco pra montar uma única tela).
  const [allOffers, siteSettings, storeDetail] = await Promise.all([
    listOffers(supabase),
    getSiteSettings(supabase),
    storeMode ? getStoreById(supabase, filters.storeId!) : Promise.resolve(null),
  ]);

  const offers = sortOffers(filterOffers(allOffers, filters), sort);

  // Histórico de TODAS as ofertas ativas, numa query só — cobre tanto o
  // selo "-X%" da grid filtrada quanto os destaques (que olham o catálogo
  // inteiro, independente do filtro atual).
  const historyByOffer = await getPriceHistoryForOffers(
    supabase,
    allOffers.map((o) => o.id),
  );

  // A barra de filtros aparece nos dois modos (na "página da loja" só sem o
  // select de loja) — mas estilo/país lá devem refletir só o catálogo
  // DAQUELA loja, não o site inteiro. `stores` (opções do select de loja) e
  // destaques só fazem sentido fora da página da loja.
  const facetOffers = storeMode ? allOffers.filter((o) => o.store_id === filters.storeId) : allOffers;
  const estilos = distinctAttributeValues(facetOffers, "estilo");
  const paises = distinctAttributeValues(facetOffers, "pais");
  const stores = storeMode ? [] : storesWithActiveOffers(allOffers);
  const featuredDeals = storeMode ? [] : computeFeaturedDeals(allOffers, historyByOffer, 5);

  // Selo "-X%" por card: mesma lógica de queda do carrossel de destaques,
  // sem limite, pra cobrir qualquer oferta com queda real (não só o top 5).
  const dropByOffer = new Map(
    computeFeaturedDeals(offers, historyByOffer, offers.length).map((d) => [d.id, d.dropPercent]),
  );

  // Carrossel de lojas usa o mesmo conjunto (com oferta ativa) do filtro.
  const storesWithOffers = stores;

  // storeId sempre vem preenchido em storeMode (é o que define o modo) — não
  // conta como "filtro ativo" pro badge do acordeon nesse caso, senão o
  // contador nunca zera na página da loja.
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== undefined && !(key === "storeId" && storeMode),
  ).length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Navbar fixo — fora da área rolável, nunca sai de vista. */}
      <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-[860px] items-start justify-between px-6 py-6">
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

      {/* Barra de filtros também fixa, logo abaixo do navbar — aparece nos
          dois modos (na página da loja, sem o select de loja). */}
      <div className="shrink-0 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="mx-auto w-full max-w-[860px]">
          <FiltersAccordion activeCount={activeFilterCount}>
            <FilterBar
              estilos={estilos}
              paises={paises}
              stores={stores}
              hideStore={storeMode}
              current={{
                estilo: sp.estilo,
                pais: sp.pais,
                storeId: sp.loja,
                precoMin: sp.min,
                precoMax: sp.max,
                q: sp.q,
                ordenar: sp.ordenar,
              }}
            />
          </FiltersAccordion>
        </div>
      </div>

      {/* Só esta área rola — o "conteúdo orgânico" da página. */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[860px] space-y-6 px-6 py-6">
          {storeMode ? (
            <StoreHeader store={storeDetail} />
          ) : (
            <>
              <FeaturedDeals deals={featuredDeals} />
              <StoreCarousel stores={storesWithOffers} />
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

        <Footer />
      </div>

      {sp.produto && (
        <Modal closeHref={closeHref}>
          <ProductDetail slug={sp.produto} />
        </Modal>
      )}
    </div>
  );
}
