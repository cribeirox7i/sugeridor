import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  listOffers,
  filterOffers,
  sortOffers,
  dedupeByProduct,
  distinctAttributeValues,
  distinctBrandValues,
  storesWithActiveOffers,
  getSiteSettings,
  getStoreById,
  getPriceHistoryForProduct,
  featuredDealsFromOffers,
  dropPercentByOffer,
} from "@/lib/queries";
import OfferCard from "@/components/OfferCard";
import FilterBar from "@/components/FilterBar";
import FiltersAccordion from "@/components/FiltersAccordion";
import FeaturedDeals from "@/components/FeaturedDeals";
import StoreCarousel from "@/components/StoreCarousel";
import StoreHeader from "@/components/StoreHeader";
import SiteHeader from "@/components/SiteHeader";
import Footer from "@/components/Footer";
import { PUBLIC_CONTAINER } from "@/lib/layout";
import Modal from "@/components/admin/Modal";
import ProductDetail from "@/components/ProductDetail";
import ProductDetailView from "@/components/ProductDetailView";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function toNumber(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

// Deriva produto e ofertas do catálogo que a Home já buscou (`allOffers`), em
// vez de disparar as queries próprias que ProductDetail faria — cada abertura
// ou fechamento do popup reexecuta a Home inteira, e o produto clicado quase
// sempre já está no array que ela acabou de buscar. Só cai pro ProductDetail
// com query (fallback) quando o slug não está no catálogo ativo — ex.: link
// antigo apontando pra um produto sem oferta ativa hoje.
//
// O histórico é a única coisa que ainda precisa de consulta, e só do produto
// aberto: são poucos pontos, contra o histórico de TODAS as ofertas ativas que
// a home carregava antes.
async function ProductPopup({
  supabase,
  slug,
  allOffers,
}: {
  supabase: SupabaseClient;
  slug: string;
  allOffers: OfferListItem[];
}) {
  const matches = allOffers.filter((o) => o.product.canonical_slug === slug);
  if (matches.length === 0) return <ProductDetail slug={slug} />;

  const product = matches[0].product;
  const offers = matches.map((o) => ({
    id: o.id,
    price: o.price,
    currency: o.currency,
    drop_percent: o.drop_percent,
    store: { name: o.store.name },
  }));
  const history = await getPriceHistoryForProduct(supabase, product.id);

  return <ProductDetailView product={product} offers={offers} history={history} />;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    estilo?: string;
    pais?: string;
    loja?: string;
    marca?: string;
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
    brand: sp.marca || undefined,
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
  if (sp.marca) closeParams.set("marca", sp.marca);
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

  // Um card por PRODUTO fora da página da loja — evita mostrar duas vezes o
  // mesmo produto só porque duas lojas o vendem (efeito esperado da
  // mesclagem funcionando, não bug). Na página da loja NÃO dedupe: cada
  // produto já aparece no máximo uma vez ali (unique product_id+store_id), e
  // o card tem que mostrar o preço DAQUELA loja — nunca o mais barato do
  // catálogo geral. Ver lib/queries.ts::dedupeByProduct.
  const displayOffers = storeMode ? offers : dedupeByProduct(offers);

  // A barra de filtros aparece nos dois modos (na "página da loja" só sem o
  // select de loja) — mas estilo/país lá devem refletir só o catálogo
  // DAQUELA loja, não o site inteiro.
  const facetOffers = storeMode ? allOffers.filter((o) => o.store_id === filters.storeId) : allOffers;
  const estilos = distinctAttributeValues(facetOffers, "estilo");
  const paises = distinctAttributeValues(facetOffers, "pais");
  const marcas = distinctBrandValues(facetOffers);
  // Derivado do array NÃO filtrado nos dois modos: na página da loja o
  // carrossel continua listando todas as lojas, funcionando como trocador (a
  // atual aparece destacada). Sem query nova.
  const stores = storesWithActiveOffers(allOffers);

  // Queda de preço vem pronta de `offers.drop_percent` (trigger da migration
  // 0013) — a home não busca mais price_history. Antes eram os pontos de
  // histórico de TODAS as ofertas ativas em cada renderização. Continua
  // vindo do array de ofertas (não do deduplicado): FeaturedDeals mostra a
  // queda por OFERTA, sem relação com o dedupe do grid abaixo.
  const featuredDeals = storeMode ? [] : featuredDealsFromOffers(allOffers, 5);
  const dropByOffer = dropPercentByOffer(displayOffers);

  // storeId sempre vem preenchido em storeMode (é o que define o modo) — não
  // conta como "filtro ativo" pro badge do acordeon nesse caso, senão o
  // contador nunca zera na página da loja.
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== undefined && !(key === "storeId" && storeMode),
  ).length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Navbar fixo — fora da área rolável, nunca sai de vista. */}
      <SiteHeader settings={siteSettings} />

      {/* Barra de ferramentas fixa: busca/filtros à esquerda, lojas à direita,
          numa faixa só. Aparece nos dois modos — na página da loja o
          `hideStore` tira apenas o select de loja. */}
      <div className="shrink-0 border-b border-neutral-200 py-3 dark:border-neutral-800">
        {/* Divisão de espaço à prova das duas quebras que já aconteceram aqui:
            a coluna de filtros fica do tamanho do próprio CONTEÚDO (busca +
            botão "Filtros" — só isso na linha principal desde que país virou
            recolhível) e o carrossel de lojas ocupa TODO o resto (`flex-1`),
            com a borda esquerda dele colada no fim do conteúdo dos filtros.
            - `lg:shrink-0` na coluna de filtros é o que evita a quebra
              antiga (o carrossel espremendo a coluna até largura zero e a
              busca sumindo) sem precisar de piso em px: ela nunca encolhe,
              só o carrossel (que rola por dentro) cede espaço.
            - ao abrir "Mais filtros" a caixa de campos ainda quebra linha
              sozinha (ver FilterBar), então não vaza a faixa mesmo com a
              coluna maior que a largura mínima de antes. */}
        <div className={`${PUBLIC_CONTAINER} flex flex-col gap-x-4 gap-y-3 lg:flex-row lg:items-start`}>
          <div className="lg:shrink-0">
            <FiltersAccordion activeCount={activeFilterCount}>
              <FilterBar
                estilos={estilos}
                paises={paises}
                marcas={marcas}
                stores={stores}
                hideStore={storeMode}
                current={{
                  estilo: sp.estilo,
                  pais: sp.pais,
                  storeId: sp.loja,
                  brand: sp.marca,
                  precoMin: sp.min,
                  precoMax: sp.max,
                  q: sp.q,
                  ordenar: sp.ordenar,
                }}
              />
            </FiltersAccordion>
          </div>

          <StoreCarousel stores={stores} currentStoreId={filters.storeId} />
        </div>
      </div>

      {/* Só esta área rola — o "conteúdo orgânico" da página. */}
      <div className="flex-1 overflow-y-auto">
        <div className={`${PUBLIC_CONTAINER} space-y-5 py-5`}>
          {storeMode ? (
            <StoreHeader store={storeDetail} offerCount={displayOffers.length} />
          ) : (
            <>
              <FeaturedDeals deals={featuredDeals} />
              {/* "produtos", não "ofertas": depois do dedupe cada card é um
                  produto (que pode ter oferta em mais de uma loja) — contar
                  "ofertas" aqui diria um número menor que o real e o rótulo
                  ficaria incoerente com o que a grade mostra. */}
              <p className="text-sm text-neutral-500 dark:text-neutral-500">
                {t("productCount", { count: displayOffers.length })}
              </p>
            </>
          )}

          {displayOffers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-neutral-800">
              {t("noOffers")}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {displayOffers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} dropPercent={dropByOffer.get(offer.id)} />
              ))}
            </div>
          )}
        </div>

        <Footer />
      </div>

      {/* `dismissOnBackdrop`: aqui o clique fora FECHA, porque o popup é uma
          espiada no produto. Os modais de cadastro do admin não passam a prop e
          só fecham no ✕, pra não perder o que foi digitado. */}
      {sp.produto && (
        <Modal closeHref={closeHref} instantClose dismissOnBackdrop>
          <ProductPopup supabase={supabase} slug={sp.produto} allOffers={allOffers} />
        </Modal>
      )}
    </div>
  );
}
