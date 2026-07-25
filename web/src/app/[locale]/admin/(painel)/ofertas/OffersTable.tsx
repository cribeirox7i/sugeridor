"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import DeleteButton from "@/components/admin/DeleteButton";
import { deleteOffers } from "./actions";

type OfferRow = {
  id: string;
  price: number;
  currency: string;
  active: boolean;
  last_seen_at: string;
  product: { name: string; brand: string | null } | null;
  store: { name: string } | null;
};

const brl = (v: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);

function offerLabel(o: OfferRow): string {
  return o.product?.brand ? `${o.product.brand} — ${o.product.name}` : o.product?.name ?? "";
}

// Tabela de ofertas com seleção em lote — extraído num client component
// porque o estado de seleção (checkboxes) só faz sentido no navegador; o
// resto do admin (filtros, paginação) continua em Server Components normais.
export default function OffersTable({
  offers,
  toggleOfferActive,
  deleteOffer,
}: {
  offers: OfferRow[];
  toggleOfferActive: (formData: FormData) => void | Promise<void>;
  deleteOffer: (formData: FormData) => void | Promise<void>;
}) {
  const t = useTranslations("admin.offers");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Ids visíveis (já filtrados pela página) — "selecionar todos" nunca
  // marca uma oferta que não está na tela por causa de outro filtro.
  const visibleIds = useMemo(() => offers.map((o) => o.id), [offers]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((cur) => {
      const copy = new Set(cur);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }

  function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(t("confirmBulkDelete", { count: selected.size }))) return;
    setBulkError(null);
    startTransition(async () => {
      const { error } = await deleteOffers([...selected]);
      if (error) {
        setBulkError(t("bulkDeleteBlocked"));
      } else {
        setSelected(new Set());
      }
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <span className="text-amber-800 dark:text-amber-200">
            {t("selectedCount", { count: selected.size })}
          </span>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={isPending}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            {t("deleteSelected")}
          </button>
        </div>
      )}
      {bulkError && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {bulkError}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-[13px]">
          <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="w-8 px-4 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={t("selectAll")}
                  className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                />
              </th>
              <th className="px-4 py-2 font-medium">{t("product")}</th>
              <th className="px-4 py-2 font-medium">{t("store")}</th>
              <th className="px-4 py-2 font-medium">{t("price")}</th>
              <th className="px-4 py-2 font-medium">{t("capturedAt")}</th>
              <th className="px-4 py-2 font-medium">{t("active")}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggleOne(o.id)}
                    className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                  />
                </td>
                <td className="px-4 py-2">{offerLabel(o) || "—"}</td>
                <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{o.store?.name ?? "—"}</td>
                <td className="px-4 py-2">{brl(o.price, o.currency)}</td>
                <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                  {new Date(o.last_seen_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-2">
                  <form action={toggleOfferActive}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="active" value={String(o.active)} />
                    <button
                      type="submit"
                      className={
                        o.active
                          ? "rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/50 dark:text-green-300"
                          : "rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                      }
                    >
                      {o.active ? t("active") : t("inactive")}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2 text-right">
                  <DeleteButton
                    action={deleteOffer}
                    id={o.id}
                    label={t("delete")}
                    confirmMessage={t("confirmDelete")}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
