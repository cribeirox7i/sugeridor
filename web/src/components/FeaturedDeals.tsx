"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import type { FeaturedDeal } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import ProductCardLink from "@/components/ProductCardLink";
import StoreOffersPopover from "@/components/StoreOffersPopover";

export default function FeaturedDeals({ deals }: { deals: FeaturedDeal[] }) {
  const t = useTranslations("home");
  const tOffer = useTranslations("offerCard");
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (deals.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("featuredTitle")}</h2>

      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Não é mais um <Link> único cobrindo o card inteiro: precisava
              caber o botão "Ver oferta" e o popover "Outras lojas" (ambos
              interativos) dentro dele, e um <a>/<button> dentro de outro <a>
              é HTML inválido — mesmo motivo do OfferCard só linkar a imagem e
              o nome via ProductCardLink, com o resto como irmãos. */}
          {deals.map((deal) => (
            <div
              key={deal.id}
              className="w-40 flex-none snap-start overflow-hidden rounded-lg border border-neutral-200 bg-white sm:w-48 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <ProductCardLink slug={deal.product.canonical_slug} className="group relative block">
                <span className="absolute left-2 top-2 z-10 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  -{Math.round(deal.dropPercent)}%
                </span>
                {/* Fundo branco FIXO (não dark:bg-*) — mesmo motivo de
                    OfferCard.tsx: dá visual padrão pra imagem venha com fundo
                    transparente ou branco embutido, nos dois temas. */}
                <div className="flex aspect-square items-center justify-center bg-white">
                  {deal.product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={deal.product.image_url}
                      alt={deal.product.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-3xl">🍺</span>
                  )}
                </div>
              </ProductCardLink>
              <div className="flex flex-col gap-2 p-3">
                <ProductCardLink
                  slug={deal.product.canonical_slug}
                  className="line-clamp-2 text-sm font-medium leading-tight hover:text-amber-600 dark:hover:text-amber-400"
                >
                  {deal.product.name}
                </ProductCardLink>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {formatPrice(deal.price, deal.currency)}
                  </span>
                  <span className="text-xs text-neutral-400 line-through">
                    {formatPrice(deal.referencePrice, deal.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-neutral-500" title={deal.store.name}>
                    {deal.store.name}
                  </span>
                  <StoreOffersPopover productId={deal.product.id} currentOfferId={deal.id} />
                </div>
                <a
                  href={`/go/${deal.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded bg-amber-600 py-1.5 text-center text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
                >
                  {tOffer("viewOffer")}
                </a>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollBy(-300)}
          aria-hidden
          tabIndex={-1}
          className="absolute left-0 top-1/2 hidden -translate-y-1/2 -translate-x-3 rounded-full border border-neutral-300 bg-white p-1.5 shadow sm:block dark:border-neutral-700 dark:bg-neutral-900"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => scrollBy(300)}
          aria-hidden
          tabIndex={-1}
          className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-3 rounded-full border border-neutral-300 bg-white p-1.5 shadow sm:block dark:border-neutral-700 dark:bg-neutral-900"
        >
          ›
        </button>
      </div>
    </section>
  );
}
