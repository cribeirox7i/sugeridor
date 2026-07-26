"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type Props = {
  estilos: string[];
  paises: string[];
  marcas: string[];
  stores: { id: string; name: string }[];
  hideStore?: boolean;
  current: {
    estilo?: string;
    pais?: string;
    storeId?: string;
    brand?: string;
    precoMin?: string;
    precoMax?: string;
    q?: string;
    ordenar?: string;
  };
};

// Formulário GET puro: submeter recarrega a página com os filtros na query string.
// Campos primários (busca/estilo/país/ordenar) cabem numa linha só no desktop;
// loja, marca e faixa de preço ficam atrás do botão de alternar — sem isso a
// barra quebrava em 2+ linhas (mais ainda depois da largura da página
// reduzida). O botão fica FORA da caixa de campos extras (não mais como
// sibling solto no meio deles via `sm:contents` — isso empurrava os campos
// pra do lado do botão): a caixa extra é seu próprio bloco com borda/fundo,
// sempre abaixo, em toda largura.
export default function FilterBar({ estilos, paises, marcas, stores, hideStore, current }: Props) {
  const t = useTranslations("filters");
  const [showMore, setShowMore] = useState(false);
  const inputCls =
    "rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const hasFilters =
    current.estilo ||
    current.pais ||
    current.storeId ||
    current.brand ||
    current.precoMin ||
    current.precoMax ||
    current.q ||
    current.ordenar;
  const moreFiltersCount = [
    !hideStore && current.storeId,
    current.brand,
    current.precoMin,
    current.precoMax,
  ].filter(Boolean).length;

  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex w-full flex-col gap-1 sm:w-36">
        <span className="text-xs text-neutral-500">{t("search")}</span>
        <input
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder={t("searchPlaceholder")}
          className={inputCls}
        />
      </label>

      <label className="flex w-full flex-col gap-1 sm:w-32">
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

      <label className="flex w-full flex-col gap-1 sm:w-28">
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

      <label className="flex w-full flex-col gap-1 sm:w-32">
        <span className="text-xs text-neutral-500">{t("sortBy")}</span>
        <select name="ordenar" defaultValue={current.ordenar ?? "preco"} className={inputCls}>
          <option value="preco">{t("sortPrice")}</option>
          <option value="nome">{t("sortName")}</option>
          <option value="pais">{t("sortCountry")}</option>
        </select>
      </label>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        aria-label={showMore ? t("lessFilters") : t("moreFilters", { count: moreFiltersCount })}
        className="flex items-center justify-center gap-1.5 rounded-full border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 sm:ml-auto sm:mb-[1px]"
      >
        <span
          aria-hidden
          className={`inline-block transition-transform ${showMore ? "rotate-180" : ""}`}
        >
          ▾
        </span>
        {moreFiltersCount > 0 && (
          <span className="rounded-full bg-amber-600 px-1.5 text-xs font-medium text-white dark:text-neutral-950">
            {moreFiltersCount}
          </span>
        )}
      </button>

      {showMore && (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:flex-wrap sm:items-end">
          {!hideStore && (
            <label className="flex w-full flex-col gap-1 sm:w-32">
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
          )}

          <label className="flex w-full flex-col gap-1 sm:w-36">
            <span className="text-xs text-neutral-500">{t("brand")}</span>
            <select name="marca" defaultValue={current.brand ?? ""} className={inputCls}>
              <option value="">{t("all")}</option>
              {marcas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <div className="flex w-full gap-3 sm:w-auto">
            <label className="flex flex-1 flex-col gap-1 sm:w-20 sm:flex-none">
              <span className="text-xs text-neutral-500">{t("minPrice")}</span>
              <input
                name="min"
                inputMode="decimal"
                defaultValue={current.precoMin ?? ""}
                placeholder="0"
                className={inputCls}
              />
            </label>

            <label className="flex flex-1 flex-col gap-1 sm:w-20 sm:flex-none">
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
        </div>
      )}

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
