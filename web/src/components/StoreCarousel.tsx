"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type StoreLite = { id: string; name: string; logo_url: string | null };

// Carrossel horizontal com as lojas que têm oferta ativa na listagem atual —
// clicar leva pra "página da loja" (/?loja=<id>, filtros/carrossel somem lá).
// Mesmo esqueleto de FeaturedDeals.tsx (scroll-snap, sem lib nova).
export default function StoreCarousel({ stores }: { stores: StoreLite[] }) {
  const t = useTranslations("home");
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (stores.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
        {t("storesTitle")}
      </h2>
      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/?loja=${store.id}`}
              className="flex flex-none snap-start items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900"
            >
              {store.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logo_url} alt={store.name} className="h-5 w-5 rounded object-contain" />
              ) : null}
              <span className="whitespace-nowrap text-neutral-700 dark:text-neutral-300">
                {store.name}
              </span>
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollBy(-200)}
          aria-hidden
          tabIndex={-1}
          className="absolute left-0 top-1/2 hidden -translate-y-1/2 -translate-x-3 rounded-full border border-neutral-300 bg-white p-1.5 shadow sm:block dark:border-neutral-700 dark:bg-neutral-900"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => scrollBy(200)}
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
