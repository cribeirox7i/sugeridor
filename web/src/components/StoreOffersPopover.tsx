"use client";

import { useEffect, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !open;
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

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-48 rounded-lg border border-neutral-200 bg-white p-2 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
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
        </div>
      )}
    </div>
  );
}
