"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FeaturedDeal } from "@/lib/queries";
import { formatPrice } from "@/lib/format";

export default function FeaturedDeals({ deals }: { deals: FeaturedDeal[] }) {
  const t = useTranslations("home");
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
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {deals.map((deal) => (
            <Link
              key={deal.id}
              href={`/produto/${deal.product.canonical_slug}`}
              className="group relative w-40 flex-none snap-start overflow-hidden rounded-lg border border-neutral-200 bg-white sm:w-48 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span className="absolute left-2 top-2 z-10 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                -{Math.round(deal.dropPercent)}%
              </span>
              <div className="flex aspect-square items-center justify-center bg-neutral-50 dark:bg-neutral-950">
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
              <div className="space-y-1 p-3">
                <p className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-amber-600 dark:group-hover:text-amber-400">
                  {deal.product.name}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {formatPrice(deal.price, deal.currency)}
                  </span>
                  <span className="text-xs text-neutral-400 line-through">
                    {formatPrice(deal.referencePrice, deal.currency)}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">{deal.store.name}</p>
              </div>
            </Link>
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
