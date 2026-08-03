"use client";

import { useRef } from "react";
import { Link } from "@/i18n/navigation";

// Mesmo padrão do StoreCarousel do site público: setas clicáveis ALÉM do
// arrasto por toque. Motivo: no Android, o gesto de "voltar" do sistema
// (swipe a partir da borda da tela) intercepta arrastões horizontais que
// começam perto da borda esquerda — em qualquer navegador, antes mesmo do
// site receber o toque. Reportado num celular real: 7 abas não cabem, o
// menu ficava com conteúdo cortado e nem tocar nem arrastar alcançava as
// abas escondidas. As setas dão um jeito de navegar que não depende do
// gesto de arrastar.
export default function AdminNavScroller({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <button
        type="button"
        onClick={() => scrollBy(-150)}
        aria-hidden
        tabIndex={-1}
        className="shrink-0 rounded-full border border-neutral-300 px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        ‹
      </button>

      <div
        ref={scrollerRef}
        className="flex min-w-0 items-center gap-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded px-3 py-1.5 text-sm whitespace-nowrap text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scrollBy(150)}
        aria-hidden
        tabIndex={-1}
        className="shrink-0 rounded-full border border-neutral-300 px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        ›
      </button>
    </div>
  );
}
