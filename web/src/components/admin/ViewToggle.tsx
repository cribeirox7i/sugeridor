"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

// Alterna ?view=grid|list preservando os outros parâmetros da URL (busca,
// etc.). Usa os hooks do next/navigation (não os do next-intl) porque só
// mexe na query string da MESMA página — o pathname já vem com o locale.
export default function ViewToggle({ defaultView = "grid" }: { defaultView?: "grid" | "list" }) {
  const t = useTranslations("admin.common");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams.get("view") as "grid" | "list") || defaultView;

  function setView(view: "grid" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.push(`${pathname}?${params.toString()}`);
  }

  const btnCls = (active: boolean) =>
    `rounded px-3 py-1.5 text-xs font-medium ${
      active
        ? "bg-amber-600 text-white dark:text-neutral-950"
        : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    }`;

  return (
    <div className="flex gap-1">
      <button onClick={() => setView("grid")} className={btnCls(current === "grid")}>
        {t("viewGrid")}
      </button>
      <button onClick={() => setView("list")} className={btnCls(current === "list")}>
        {t("viewList")}
      </button>
    </div>
  );
}
