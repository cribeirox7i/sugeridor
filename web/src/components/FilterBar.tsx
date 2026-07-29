"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

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
  // Campo de busca controlado: o botão ao lado precisa saber se o texto na tela
  // ainda é o mesmo da busca já aplicada (ver `buscaAplicada` abaixo).
  const [q, setQ] = useState(current.q ?? "");
  // Ref porque o ✕ precisa esvaziar o campo ANTES do submit nativo: `setQ("")`
  // é assíncrono, o React ainda não re-renderizou quando o navegador serializa
  // o formulário, e a busca voltava com o texto antigo.
  const inputRef = useRef<HTMLInputElement>(null);
  const inputCls =
    "rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

  // Um botão só, com dois papéis: LUPA enquanto há algo novo pra buscar, ✕
  // quando o que está no campo é exatamente a busca que já está valendo.
  // Assim o mesmo espaço serve pra aplicar e pra limpar, e não sobra um
  // "Limpar" solto na barra — que na página da loja aparecia SEMPRE (o
  // filtro de loja conta como filtro ativo) e, pior, apontava pra "/",
  // tirando o usuário da loja em que ele estava.
  const buscaAplicada = Boolean(current.q) && q === current.q;
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
      {/* Na página da loja o select de loja não existe (hideStore), então sem
          este campo escondido QUALQUER submissão da barra — buscar, filtrar,
          ordenar — perdia o `?loja=` e jogava o usuário de volta pro catálogo
          geral. */}
      {hideStore && current.storeId && (
        <input type="hidden" name="loja" value={current.storeId} />
      )}

      {/* Busca com o botão acoplado, como um campo só. */}
      <div className="flex min-w-0 flex-1 items-center sm:flex-none">
        <label className="sr-only" htmlFor="filtro-busca">
          {t("search")}
        </label>
        <input
          ref={inputRef}
          id="filtro-busca"
          // `type="text"` e não `"search"`: o ✕ nativo do WebKit apareceria
          // junto do nosso, dois botões de limpar no mesmo campo.
          type="text"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className={`${inputCls} w-full rounded-r-none sm:w-44`}
        />
        {buscaAplicada ? (
          // Limpar = submeter com o campo vazio, e não navegar pra "/": assim
          // os outros filtros (e a loja atual, na página da loja) continuam
          // valendo. O `q=` vazio é tratado como ausente na página.
          <button
            type="submit"
            onClick={() => {
              // Direto no DOM, não só no estado: é este valor que o submit
              // nativo (que acontece logo depois deste handler) serializa.
              if (inputRef.current) inputRef.current.value = "";
              setQ("");
            }}
            aria-label={t("clear")}
            title={t("clear")}
            className="rounded rounded-l-none border border-amber-600 bg-amber-600 px-2.5 py-1.5 text-sm text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            <span aria-hidden>✕</span>
          </button>
        ) : (
          <button
            type="submit"
            aria-label={t("filter")}
            title={t("filter")}
            className="rounded rounded-l-none border border-amber-600 bg-amber-600 px-2.5 py-1.5 text-sm text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            <span aria-hidden>⌕</span>
          </button>
        )}
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
