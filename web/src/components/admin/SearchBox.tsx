import { getTranslations } from "next-intl/server";

// Form GET simples (sem JS) — preserva o ?view= atual ao buscar.
export default async function SearchBox({
  placeholder,
  defaultValue,
  view,
}: {
  placeholder: string;
  defaultValue?: string;
  view?: string;
}) {
  const t = await getTranslations("admin.common");

  return (
    <form method="get" className="flex gap-2">
      {view && <input type="hidden" name="view" value={view} />}
      <input
        type="search"
        name="q"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className="w-full max-w-xs rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
      />
      <button
        type="submit"
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {t("search")}
      </button>
    </form>
  );
}
