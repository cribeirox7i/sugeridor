"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type StoreLite = { id: string; name: string; logo_url: string | null };

// Bloco de lojas da barra de ferramentas: pílulas roláveis com logo+nome, mais
// o atalho "Todas as lojas". Antes era uma `<section>` com título próprio
// ABAIXO dos filtros; virou parte da barra pra recuperar a faixa vertical que
// ela ocupava.
//
// Continua visível na "página da loja" (`?loja=<id>`), onde funciona como
// trocador — a loja atual aparece destacada. Só links, nenhum campo de
// formulário: fica fora do <form> do FilterBar.
export default function StoreCarousel({
  stores,
  currentStoreId,
}: {
  stores: StoreLite[];
  currentStoreId?: string;
}) {
  const t = useTranslations("home");
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (stores.length === 0) return null;

  return (
    // Largura DEFINIDA no desktop (`lg:w-[340px] lg:shrink-0`) em vez de
    // largura de conteúdo: é isso que impede as pílulas somadas (1292px com 9
    // lojas, e cresce a cada loja nova) de esmagarem a coluna de filtros ao
    // lado. Rolar horizontalmente dentro dos 340px é o comportamento
    // pretendido. `min-w-0` é o que deixa o scroller de fato rolar em vez de
    // esticar; `w-full` vale no mobile, onde o flex da barra é coluna.
    <div className="flex w-full min-w-0 flex-col items-end gap-0.5 lg:w-[340px] lg:shrink-0">
      <div className="flex w-full min-w-0 items-center gap-1.5">
        <span className="hidden whitespace-nowrap text-xs text-neutral-500 sm:inline">
          {t("storesTitle")}
        </span>

        <button
          type="button"
          onClick={() => scrollBy(-200)}
          aria-hidden
          tabIndex={-1}
          className="hidden shrink-0 rounded-full border border-neutral-300 px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 sm:block dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          ‹
        </button>

        <div
          ref={scrollerRef}
          className="flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {stores.map((store) => {
            const active = store.id === currentStoreId;
            return (
              <Link
                key={store.id}
                href={`/?loja=${store.id}`}
                aria-current={active ? "true" : undefined}
                className={`flex flex-none snap-start items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
                  active
                    ? "border-amber-500 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40"
                    : "border-neutral-200 bg-white hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900"
                }`}
              >
                {store.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={store.logo_url}
                    alt=""
                    className="h-4 w-4 rounded object-contain"
                  />
                ) : null}
                <span className="whitespace-nowrap text-neutral-700 dark:text-neutral-300">
                  {store.name}
                </span>
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollBy(200)}
          aria-hidden
          tabIndex={-1}
          className="hidden shrink-0 rounded-full border border-neutral-300 px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 sm:block dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          ›
        </button>
      </div>

      <Link
        href="/lojas"
        className="whitespace-nowrap text-xs text-amber-700 hover:underline dark:text-amber-500"
      >
        {t("allStores")}
      </Link>
    </div>
  );
}
