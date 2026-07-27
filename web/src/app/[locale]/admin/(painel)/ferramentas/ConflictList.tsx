"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { mergeProducts } from "./actions";

export type ConflictPair = {
  slug: string;
  keep: { id: string; name: string; brand: string | null; offers: number };
  drop: { id: string; name: string; brand: string | null; offers: number };
};

// Lista de produtos que ficariam com o mesmo slug depois das substituições —
// ou seja, são o mesmo produto cadastrado duas vezes. Nada é mesclado
// automaticamente (decisão explícita): cada par mostra os dois lados e o
// usuário decide. Mesclar move as ofertas e apaga um produto, então é
// irreversível.
export default function ConflictList({ conflicts }: { conflicts: ConflictPair[] }) {
  const t = useTranslations("admin.tools");
  const [erro, setErro] = useState<string | null>(null);
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  if (conflicts.length === 0) return null;

  function merge(par: ConflictPair) {
    if (!confirm(t("confirmMerge", { keep: par.keep.name, drop: par.drop.name }))) return;
    setErro(null);
    startTransition(async () => {
      // Mantém o produto com mais ofertas (perde-se menos no caminho); em
      // empate, o `keep` que a página já escolheu (o mais antigo).
      const [keep, drop] =
        par.drop.offers > par.keep.offers ? [par.drop, par.keep] : [par.keep, par.drop];
      const { error } = await mergeProducts(keep.id, drop.id);
      if (error) setErro(error);
      else setFeitos((prev) => new Set(prev).add(par.slug));
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
      <div>
        <h2 className="font-medium">{t("conflictsTitle", { count: conflicts.length })}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{t("conflictsHint")}</p>
      </div>

      {erro && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("mergeFailed")} {erro}
        </p>
      )}

      <ul className="space-y-3">
        {conflicts.map((par) => {
          const done = feitos.has(par.slug);
          return (
            <li
              key={par.slug}
              className="rounded border border-neutral-200 bg-white p-3 text-[13px] dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  {[par.keep, par.drop].map((lado, i) => (
                    <div key={lado.id}>
                      <span className="text-neutral-400">{i === 0 ? "A" : "B"}</span>{" "}
                      <span className="font-medium">{lado.name}</span>
                      <span className="text-neutral-500"> · {lado.brand ?? "—"}</span>
                      <span className="text-neutral-500">
                        {" "}
                        · {t("offerCount", { count: lado.offers })}
                      </span>
                    </div>
                  ))}
                </div>
                {done ? (
                  <span className="shrink-0 rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/50 dark:text-green-300">
                    {t("merged")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => merge(par)}
                    disabled={isPending}
                    className="shrink-0 rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
