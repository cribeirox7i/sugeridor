import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type Props = {
  estilos: string[];
  paises: string[];
  stores: { id: string; name: string }[];
  current: {
    estilo?: string;
    pais?: string;
    storeId?: string;
    precoMin?: string;
    precoMax?: string;
  };
};

// Formulário GET puro: submeter recarrega a página com os filtros na query string.
// Sem JS no cliente — funciona com cache/SSR e é simples de linkar/compartilhar.
export default function FilterBar({ estilos, paises, stores, current }: Props) {
  const t = useTranslations("filters");
  const inputCls =
    "rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const hasFilters =
    current.estilo || current.pais || current.storeId || current.precoMin || current.precoMax;

  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex w-full flex-col gap-1 sm:w-auto">
        <span className="text-xs text-neutral-500">{t("style")}</span>
        <select name="estilo" defaultValue={current.estilo ?? ""} className={inputCls}>
          <option value="">{t("all")}</option>
          {estilos.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1 sm:w-auto">
        <span className="text-xs text-neutral-500">{t("country")}</span>
        <select name="pais" defaultValue={current.pais ?? ""} className={inputCls}>
          <option value="">{t("all")}</option>
          {paises.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1 sm:w-auto">
        <span className="text-xs text-neutral-500">{t("store")}</span>
        <select name="loja" defaultValue={current.storeId ?? ""} className={inputCls}>
          <option value="">{t("allFem")}</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex w-full gap-3 sm:w-auto">
        <label className="flex flex-1 flex-col gap-1 sm:w-24 sm:flex-none">
          <span className="text-xs text-neutral-500">{t("minPrice")}</span>
          <input
            name="min"
            inputMode="decimal"
            defaultValue={current.precoMin ?? ""}
            placeholder="0"
            className={inputCls}
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 sm:w-24 sm:flex-none">
          <span className="text-xs text-neutral-500">{t("maxPrice")}</span>
          <input
            name="max"
            inputMode="decimal"
            defaultValue={current.precoMax ?? ""}
            placeholder="∞"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="submit"
          className="flex-1 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 sm:flex-none dark:text-neutral-950"
        >
          {t("filter")}
        </button>

        {hasFilters && (
          <Link
            href="/"
            className="flex-1 rounded border border-neutral-300 px-4 py-2 text-center text-sm text-neutral-600 hover:bg-neutral-100 sm:flex-none dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            {t("clear")}
          </Link>
        )}
      </div>
    </form>
  );
}
