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

// Formulário GET puro: submeter recarrega a página com os filtros na query
// string. Continua GET (e não roteamento client-side) de propósito — é o que
// mantém filtro compartilhável por URL e o estado inteiro no servidor.
//
// Layout: só BUSCA e PAÍS ficam visíveis na linha principal; estilo, marca,
// loja, faixa de preço E ordenação ficam atrás do botão "Mais filtros e
// ordenação". Antes eram 4 controles rotulados na linha, o que somado ao
// carrossel de lojas logo abaixo consumia duas faixas verticais inteiras.
//
// Os selects auto-submetem no `change`: num form GET, mexer num select não
// envia nada, então antes era obrigatório clicar em "Filtrar" depois de cada
// escolha. Com o auto-submit o único botão que sobra é a lupa, e ela serve só
// pro campo de texto.
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

  // Conta o que está ativo DENTRO da caixa recolhida — é o número no badge, e
  // serve pra avisar que existe filtro valendo mesmo com a caixa fechada.
  // `ordenar` só conta quando difere do padrão (preço), senão o badge nasceria
  // com 1 em toda visita.
  const moreFiltersCount = [
    current.estilo,
    !hideStore && current.storeId,
    current.brand,
    current.precoMin,
    current.precoMax,
    current.ordenar && current.ordenar !== "preco",
  ].filter(Boolean).length;

  // Auto-submit dos selects (ver comentário do componente).
  const submitOnChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    e.target.form?.requestSubmit();

  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {/* Busca com a lupa acoplada, como um campo só. */}
      <div className="flex min-w-0 flex-1 items-center sm:flex-none">
        <label className="sr-only" htmlFor="filtro-busca">
          {t("search")}
        </label>
        <input
          id="filtro-busca"
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder={t("searchPlaceholder")}
          className={`${inputCls} w-full rounded-r-none sm:w-44`}
        />
        <button
          type="submit"
          aria-label={t("filter")}
          className="rounded rounded-l-none border border-amber-600 bg-amber-600 px-2.5 py-1.5 text-sm text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          <span aria-hidden>⌕</span>
        </button>
      </div>

      <label className="flex items-center gap-1.5">
        <span className="whitespace-nowrap text-xs text-neutral-500">{t("country")}</span>
        <select
          name="pais"
          defaultValue={current.pais ?? ""}
          onChange={submitOnChange}
          className={inputCls}
        >
          <option value="">{t("all")}</option>
          {paises.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        aria-label={showMore ? t("lessFilters") : t("moreFilters", { count: moreFiltersCount })}
        title={t("moreFilters", { count: moreFiltersCount })}
        className="flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <span aria-hidden>⚙</span>
        {/* Texto visível a partir de xl: um botão só com engrenagem não diz o
            que faz. Abaixo disso fica ícone + badge, com o rótulo completo no
            title/aria-label. */}
        <span className="hidden whitespace-nowrap xl:inline">{t("moreFiltersShort")}</span>
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

      {hasFilters && (
        <Link
          href="/"
          className="whitespace-nowrap rounded border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          {t("clear")}
        </Link>
      )}

      {/* Caixa recolhível: bloco próprio com borda/fundo, sempre em toda a
          largura e ABAIXO da linha principal (nunca como sibling solto no meio
          dos outros controles — isso já causou sobreposição visual antes). */}
      {showMore && (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex w-full flex-col gap-1 sm:w-32">
            <span className="text-xs text-neutral-500">{t("style")}</span>
            <select
              name="estilo"
              defaultValue={current.estilo ?? ""}
              onChange={submitOnChange}
              className={inputCls}
            >
              <option value="">{t("all")}</option>
              {estilos.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>

          {!hideStore && (
            <label className="flex w-full flex-col gap-1 sm:w-32">
              <span className="text-xs text-neutral-500">{t("store")}</span>
              <select
                name="loja"
                defaultValue={current.storeId ?? ""}
                onChange={submitOnChange}
                className={inputCls}
              >
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
            <select
              name="marca"
              defaultValue={current.brand ?? ""}
              onChange={submitOnChange}
              className={inputCls}
            >
              <option value="">{t("all")}</option>
              {marcas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-full flex-col gap-1 sm:w-32">
            <span className="text-xs text-neutral-500">{t("sortBy")}</span>
            <select
              name="ordenar"
              defaultValue={current.ordenar ?? "preco"}
              onChange={submitOnChange}
              className={inputCls}
            >
              <option value="preco">{t("sortPrice")}</option>
              <option value="nome">{t("sortName")}</option>
              <option value="pais">{t("sortCountry")}</option>
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

          {/* Preço é texto, não select: precisa de um submit explícito. */}
          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {t("filter")}
          </button>
        </div>
      )}
    </form>
  );
}
