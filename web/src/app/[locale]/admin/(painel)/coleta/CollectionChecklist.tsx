"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleStoreCollection, setStoresCollection } from "./actions";

type StoreRow = { id: string; name: string; platform: string; include_in_collection: boolean };

export default function CollectionChecklist({ stores }: { stores: StoreRow[] }) {
  const t = useTranslations("admin.collection");
  const [included, setIncluded] = useState(
    () => new Set(stores.filter((s) => s.include_in_collection).map((s) => s.id)),
  );
  const [, startTransition] = useTransition();

  function toggle(id: string) {
    const next = !included.has(id);
    setIncluded((cur) => {
      const copy = new Set(cur);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    startTransition(() => {
      toggleStoreCollection(id, next);
    });
  }

  function setAll(value: boolean) {
    setIncluded(value ? new Set(stores.map((s) => s.id)) : new Set());
    startTransition(() => {
      setStoresCollection(
        stores.map((s) => s.id),
        value,
      );
    });
  }

  if (stores.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-3 text-xs">
        <button
          type="button"
          onClick={() => setAll(true)}
          className="text-amber-600 underline decoration-dotted hover:text-amber-700 dark:text-amber-400"
        >
          {t("selectAll")}
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          className="text-amber-600 underline decoration-dotted hover:text-amber-700 dark:text-amber-400"
        >
          {t("selectNone")}
        </button>
      </div>
      <ul className="space-y-1 text-neutral-600 dark:text-neutral-300">
        {stores.map((s) => (
          <li key={s.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={included.has(s.id)}
                onChange={() => toggle(s.id)}
                className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
              />
              <span>
                {s.name} <span className="text-neutral-500 dark:text-neutral-600">({s.platform})</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
