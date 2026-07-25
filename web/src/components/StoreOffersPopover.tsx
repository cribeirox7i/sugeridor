"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/format";

type StoreOffer = {
  id: string;
  price: number;
  currency: string;
  store: { id: string; name: string } | null;
};

export default function StoreOffersPopover({
  productId,
  currentOfferId,
}: {
  productId: string;
  currentOfferId: string;
}) {
  const t = useTranslations("offerCard");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<StoreOffer[] | null>(null);
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // O popover é um portal (fora da árvore de containerRef) — checa os
      // dois, senão todo clique nele mesmo seria lido como "clique fora".
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    // Fecha em scroll/resize em vez de reposicionar — mais simples e evita o
    // popover "flutuar" desalinhado do botão que o abriu.
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !open;
    if (next) {
      // Posição calculada em viewport (fixed) — o popover é renderizado via
      // portal no <body>, fora do `overflow-hidden` do card (que antes
      // cortava o conteúdo, ficando "preso dentro do card").
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setCoords({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
    }
    setOpen(next);
    if (next && offers === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/offers/by-product/${productId}`);
        const data = await res.json();
        setOffers(data.offers ?? []);
      } catch {
        setOffers([]);
      } finally {
        setLoading(false);
      }
    }
  }

  const others = (offers ?? []).filter((o) => o.id !== currentOfferId);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggle}
        className="text-xs text-neutral-500 underline decoration-dotted hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        {t("otherStores")}
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", left: coords.left, bottom: coords.bottom }}
            className="z-50 w-48 rounded-lg border border-neutral-200 bg-white p-2 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            {loading ? (
              <p className="px-2 py-1 text-neutral-500">{t("loadingStores")}</p>
            ) : others.length === 0 ? (
              <p className="px-2 py-1 text-neutral-500">{t("noOtherStores")}</p>
            ) : (
              <ul className="space-y-1">
                {others.map((o) => (
                  <li key={o.id}>
                    <a
                      href={`/go/${o.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <span className="text-neutral-700 dark:text-neutral-300">{o.store?.name}</span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {formatPrice(o.price, o.currency)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
