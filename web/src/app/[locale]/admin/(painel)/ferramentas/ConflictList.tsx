"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { mergeProductGroups } from "./actions";

export type ConflictSide = {
  id: string;
  name: string;
  brand: string | null;
  offers: number;
  hasImage: boolean;
  // Menor preço ativo, já formatado no servidor. Mostrar aqui é o que revela a
  // duplicata cara: o registro abandonado fica com o preço da última coleta que
  // o viu, então os dois lados aparecem com valores diferentes para o MESMO
  // produto na MESMA loja.
  priceLabel: string | null;
};

// Um grupo é o mesmo produto cadastrado 2+ vezes. `sides[0]` é o que fica —
// decidido por chooseKeeper (lib/merge.ts) no servidor, a mesma função que a
// Server Action reconfere, pra o texto do confirmar não dizer o contrário do
// que vai acontecer.
export type ConflictGroup = {
  key: string;
  sides: ConflictSide[];
};

// Lista de produtos duplicados, com mesclagem individual e em lote. Nada é
// mesclado automaticamente (decisão explícita): mesclar move as ofertas e apaga
// um registro, e não tem como desfazer — então a ação é sempre do usuário. O que
// mudou é a escala: eram 219 grupos pra confirmar um por um, o que na prática
// deixava o catálogo duplicado pra sempre.
export default function ConflictList({
  groups,
  title,
  hint,
}: {
  groups: ConflictGroup[];
  title: string;
  hint: string;
}) {
  const t = useTranslations("admin.tools");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  if (groups.length === 0) return null;

  const pendentes = groups.filter((g) => !feitos.has(g.key));
  const selecionados = pendentes.filter((g) => marcados.has(g.key));

  function mesclar(alvos: ConflictGroup[], confirmMessage: string) {
    if (alvos.length === 0) return;
    if (!confirm(confirmMessage)) return;
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const { mergedIndexes, failed, error } = await mergeProductGroups(
        alvos.map((g) => g.sides.map((s) => s.id)),
      );
      if (error) setErro(error);
      // Sucesso parcial é o caso comum em lote: uma oferta com disparo de alerta
      // vinculado barra a exclusão daquele grupo sem afetar os outros. A ação
      // devolve os índices que deram certo, então a tela marca exatamente esses.
      if (failed > 0) setAviso(t("mergeBatchPartial", { merged: mergedIndexes.length, failed }));
      if (mergedIndexes.length > 0) {
        setFeitos((prev) => {
          const next = new Set(prev);
          for (const i of mergedIndexes) {
            const g = alvos[i];
            if (g) next.add(g.key);
          }
          return next;
        });
        setMarcados(new Set());
      }
    });
  }

  const btn =
    "rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

  return (
    <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
      <div>
        <h2 className="font-medium">
          {title} ({pendentes.length})
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{hint}</p>
      </div>

      {erro && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("mergeFailed")} {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
          {aviso}
        </p>
      )}

      {/* Ações em lote — o motivo desta tela existir a 219 grupos. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 pb-3 dark:border-amber-900">
        <button
          type="button"
          onClick={() =>
            setMarcados(
              marcados.size === pendentes.length ? new Set() : new Set(pendentes.map((g) => g.key)),
            )
          }
          className={btn}
        >
          {marcados.size === pendentes.length ? t("selectNone") : t("selectAll")}
        </button>
        <button
          type="button"
          disabled={isPending || selecionados.length === 0}
          onClick={() =>
            mesclar(selecionados, t("confirmMergeBatch", { count: selecionados.length }))
          }
          className={btn}
        >
          {t("mergeSelected", { count: selecionados.length })}
        </button>
        <button
          type="button"
          disabled={isPending || pendentes.length === 0}
          onClick={() => mesclar(pendentes, t("confirmMergeAll", { count: pendentes.length }))}
          className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 dark:text-neutral-950"
        >
          {t("mergeAll", { count: pendentes.length })}
        </button>
        {isPending && <span className="text-xs text-neutral-500">{t("merging")}</span>}
      </div>

      <ul className="space-y-3">
        {groups.map((grupo) => {
          const done = feitos.has(grupo.key);
          const [keep, ...drops] = grupo.sides;
          return (
            <li
              key={grupo.key}
              className={`rounded border border-neutral-200 bg-white p-3 text-[13px] dark:border-neutral-800 dark:bg-neutral-900 ${
                done ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {!done && (
                    <input
                      type="checkbox"
                      checked={marcados.has(grupo.key)}
                      onChange={(e) =>
                        setMarcados((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(grupo.key);
                          else next.delete(grupo.key);
                          return next;
                        })
                      }
                      className="mt-0.5"
                      aria-label={t("mergeButton")}
                    />
                  )}
                  <div className="space-y-1">
                    {/* O lado mantido vem primeiro e marcado — quem lê precisa
                        saber qual registro sobrevive antes de confirmar. */}
                    <div>
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] text-green-700 dark:bg-green-900/50 dark:text-green-300">
                        {t("sideKeep")}
                      </span>{" "}
                      <span className="font-medium">{keep.name}</span>
                      <span className="text-neutral-500"> · {keep.brand ?? "—"}</span>
                      <span className="text-neutral-500"> · {t("offerCount", { count: keep.offers })}</span>
                      {keep.priceLabel && <span className="text-neutral-500"> · {keep.priceLabel}</span>}
                      {!keep.hasImage && <span className="text-amber-600 dark:text-amber-400"> · {t("noImage")}</span>}
                    </div>
                    {drops.map((lado) => (
                      <div key={lado.id}>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                          {t("sideDrop")}
                        </span>{" "}
                        <span className="line-through decoration-neutral-300">{lado.name}</span>
                        <span className="text-neutral-500"> · {lado.brand ?? "—"}</span>
                        <span className="text-neutral-500"> · {t("offerCount", { count: lado.offers })}</span>
                        {lado.priceLabel && <span className="text-neutral-500"> · {lado.priceLabel}</span>}
                        {!lado.hasImage && <span className="text-amber-600 dark:text-amber-400"> · {t("noImage")}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                {done ? (
                  <span className="shrink-0 rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/50 dark:text-green-300">
                    {t("merged")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      mesclar([grupo], t("confirmMerge", { keep: keep.name, drop: drops[0]?.name ?? "" }))
                    }
                    disabled={isPending}
                    className={`shrink-0 ${btn}`}
                  >
                    {t("mergeButton")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
