"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Store } from "@/lib/types";
import DeleteButton from "@/components/admin/DeleteButton";
import DetectPlatformCardButton from "./DetectPlatformCardButton";
import {
  deleteStores,
  setStoresCollection,
  toggleStoreCollection,
  setStoresActive,
  toggleStoreActive,
} from "./actions";

type ServerAction = (formData: FormData) => void | Promise<void>;

// Tabela de lojas com seleção em lote — mesmo padrão já testado em
// ofertas/OffersTable.tsx. Absorveu a tela /admin/coleta: a coluna "Coleta"
// liga/desliga `include_in_collection` (era o CollectionChecklist) e a barra de
// lote permite disparar a coleta só das lojas marcadas.
export default function StoresTable({
  stores,
  deleteStore,
}: {
  stores: Store[];
  // Vem por prop porque é usada dentro de <form action>; as demais são
  // importadas direto pra poderem devolver erro sem navegar.
  deleteStore: ServerAction;
}) {
  const t = useTranslations("admin.stores");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Só o que está na tela: "selecionar todos" nunca marca loja escondida pelo
  // filtro de busca.
  const visibleIds = useMemo(() => stores.map((s) => s.id), [stores]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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
      const { error } = await deleteStores([...selected]);
      if (error) setBulkError(t("bulkDeleteBlocked"));
      else setSelected(new Set());
    });
  }

  function bulkCollection(included: boolean) {
    if (selected.size === 0) return;
    setBulkError(null);
    startTransition(async () => {
      const { error } = await setStoresCollection([...selected], included);
      if (error) setBulkError(error);
      else setSelected(new Set());
    });
  }

  function bulkActive(active: boolean) {
    if (selected.size === 0) return;
    setBulkError(null);
    startTransition(async () => {
      const { error } = await setStoresActive([...selected], active);
      if (error) setBulkError(error);
      else setSelected(new Set());
    });
  }

  // Dispara o workflow só pras lojas marcadas (o endpoint aceita a lista e a
  // repassa como input; ver api/admin/scrape/route.ts).
  function collectSelected() {
    if (selected.size === 0) return;
    setBulkError(null);
    setScrapeMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeIds: [...selected] }),
        });
        const data = await res.json();
        setScrapeMsg(res.ok ? t("dispatchedOk") : (data.error ?? t("dispatchFail")));
        if (res.ok) setSelected(new Set());
      } catch {
        setScrapeMsg(t("networkError"));
      }
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <span>{t("selectedCount", { count: selected.size })}</span>
          <button
            type="button"
            onClick={collectSelected}
            disabled={isPending}
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 dark:text-neutral-950"
          >
            {t("collectSelected")}
          </button>
          <button
            type="button"
            onClick={() => bulkCollection(true)}
            disabled={isPending}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {t("includeSelected")}
          </button>
          <button
            type="button"
            onClick={() => bulkCollection(false)}
            disabled={isPending}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {t("excludeSelected")}
          </button>
          <button
            type="button"
            onClick={() => bulkActive(true)}
            disabled={isPending}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {t("activateSelected")}
          </button>
          <button
            type="button"
            onClick={() => bulkActive(false)}
            disabled={isPending}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {t("deactivateSelected")}
          </button>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={isPending}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
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
      {scrapeMsg && (
        <p className="rounded bg-blue-100 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {scrapeMsg}
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
              <th className="px-4 py-2 font-medium">{t("nameColumn")}</th>
              <th className="px-4 py-2 font-medium">{t("site")}</th>
              <th className="px-4 py-2 font-medium">{t("platformColumn")}</th>
              <th className="px-4 py-2 font-medium">{t("activeColumn")}</th>
              <th className="px-4 py-2 font-medium">{t("collectionColumn")}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                    aria-label={s.name}
                    className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                  />
                </td>
                <td className="px-4 py-2">{s.name}</td>
                <td className="max-w-[220px] truncate px-4 py-2 text-neutral-500 dark:text-neutral-400">
                  {s.site_url ? (
                    <a
                      href={s.site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {s.site_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                  {s.platform ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={s.active}
                      onChange={(e) => startTransition(() => toggleStoreActive(s.id, e.target.checked))}
                      className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                    />
                    <span className="text-xs text-neutral-500">
                      {s.active ? t("activeOn") : t("activeOff")}
                    </span>
                  </label>
                </td>
                <td className="px-4 py-2">
                  {s.platform ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={s.include_in_collection}
                        onChange={(e) =>
                          startTransition(() => toggleStoreCollection(s.id, e.target.checked))
                        }
                        className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                      />
                      <span className="text-xs text-neutral-500">
                        {s.include_in_collection ? t("collectionOn") : t("collectionOff")}
                      </span>
                    </label>
                  ) : (
                    <span className="text-xs text-neutral-400">{t("collectionNone")}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <DetectPlatformCardButton storeId={s.id} siteUrl={s.site_url} />
                    <Link
                      href={`/admin/lojas?edit=${s.id}`}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {t("edit")}
                    </Link>
                    <DeleteButton
                      action={deleteStore}
                      id={s.id}
                      label={t("delete")}
                      confirmMessage={t("confirmDelete", { name: s.name })}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
