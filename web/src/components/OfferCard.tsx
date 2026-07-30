import { useTranslations } from "next-intl";
import type { OfferListItem } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import StoreOffersPopover from "@/components/StoreOffersPopover";
import ProductCardLink from "@/components/ProductCardLink";
import StoreLogo from "@/components/StoreLogo";

export default function OfferCard({
  offer,
  dropPercent,
}: {
  offer: OfferListItem;
  dropPercent?: number;
}) {
  const t = useTranslations("offerCard");
  const { product, store } = offer;
  const estilo = product.attributes?.estilo as string | undefined;
  const pais = product.attributes?.pais as string | undefined;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <ProductCardLink slug={product.canonical_slug} className="block">
        {/* Fundo branco FIXO (não dark:bg-*): a fonte traz imagem com fundo
            transparente OU branco, sem padrão — no tema escuro a transparente
            "sangrava" pro fundo do card e a branca destoava do resto. Um
            fundo branco fixo por trás resolve as duas, dando visual padrão. */}
        <div className="flex aspect-square items-center justify-center bg-white p-3">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-4xl">🍺</span>
          )}
        </div>
      </ProductCardLink>

      {/* p-3 (não p-4): com 5 cards por linha a 976px cada um tem ~173px, e o
          padding maior deixava o nome do produto quebrando em 3 linhas. */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex-1">
          {product.brand && (
            <p className="text-xs uppercase tracking-wide text-neutral-500">{product.brand}</p>
          )}
          <ProductCardLink
            slug={product.canonical_slug}
            className="text-sm font-medium leading-tight hover:text-amber-600 dark:hover:text-amber-400"
          >
            {product.name}
          </ProductCardLink>
          <div className="mt-1 flex flex-wrap gap-1">
            {estilo && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {estilo}
              </span>
            )}
            {pais && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {pais}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">
            {formatPrice(offer.price, offer.currency)}
          </span>
          {dropPercent != null && dropPercent > 0 && (
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              -{Math.round(dropPercent)}%
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-1.5" title={store.name}>
            {store.logo_url ? (
              <StoreLogo src={store.logo_url} alt={store.name} size="h-4 w-4" />
            ) : (
              <span className="truncate text-neutral-500">{store.name}</span>
            )}
          </div>
          <StoreOffersPopover productId={product.id} currentOfferId={offer.id} />
        </div>

        <a
          href={`/go/${offer.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded bg-amber-600 py-1.5 text-center text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          {t("viewOffer")}
        </a>
      </div>
    </div>
  );
}
