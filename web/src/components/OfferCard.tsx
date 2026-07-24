import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { OfferListItem } from "@/lib/types";
import { formatPrice } from "@/lib/format";

export default function OfferCard({ offer }: { offer: OfferListItem }) {
  const t = useTranslations("offerCard");
  const { product, store } = offer;
  const estilo = product.attributes?.estilo as string | undefined;
  const pais = product.attributes?.pais as string | undefined;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <Link href={`/produto/${product.canonical_slug}`} className="block">
        <div className="flex aspect-square items-center justify-center bg-neutral-50 dark:bg-neutral-950">
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
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex-1">
          {product.brand && (
            <p className="text-xs uppercase tracking-wide text-neutral-500">{product.brand}</p>
          )}
          <Link
            href={`/produto/${product.canonical_slug}`}
            className="font-medium leading-tight hover:text-amber-600 dark:hover:text-amber-400"
          >
            {product.name}
          </Link>
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

        <div className="flex items-end justify-between">
          <div>
            <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
              {formatPrice(offer.price, offer.currency)}
            </div>
            <div className="text-xs text-neutral-500">{store.name}</div>
          </div>
          <a
            href={`/go/${offer.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {t("viewOffer")}
          </a>
        </div>
      </div>
    </div>
  );
}
