"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// No mobile os filtros tomavam metade da tela — vira acordeon fechado por
// padrão. No desktop (sm:) sempre visível, sem botão de alternar.
export default function FiltersAccordion({
  children,
  activeCount,
}: {
  children: React.ReactNode;
  activeCount: number;
}) {
  const t = useTranslations("filters");
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 sm:hidden dark:border-neutral-700 dark:text-neutral-300"
      >
        <span>{t("toggle", { count: activeCount })}</span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      <div className={`${open ? "mt-3 block" : "hidden"} sm:mt-0 sm:block`}>{children}</div>
    </div>
  );
}
