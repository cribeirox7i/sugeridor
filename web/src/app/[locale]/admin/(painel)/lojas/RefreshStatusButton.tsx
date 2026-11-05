"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatTimeWithSeconds } from "@/lib/format";

/** Botão que recarrega o status da coleta sem sair da tela.
 *
 * A página é Server Component com `dynamic = "force-dynamic"`, então
 * `router.refresh()` basta: o Next refaz a request do servidor, relê
 * `ingestion_jobs` e troca só a árvore renderizada — o estado do cliente
 * (modo cartões/lista, busca, posição de scroll) sobrevive, o que um
 * `location.reload()` perderia.
 *
 * `fetchedAt` vem do servidor em ISO e é formatado aqui pra mostrar de quando
 * é o que está na tela: sem isso, depois de um refresh que não muda nada (job
 * ainda rodando) não há como saber se a tela está velha ou se a coleta é que
 * não andou.
 */
export default function RefreshStatusButton({ fetchedAt }: { fetchedAt: string }) {
  const t = useTranslations("admin.stores");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {isPending ? t("refreshing") : t("refresh")}
      </button>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        {t("updatedAt", { time: formatTimeWithSeconds(fetchedAt) })}
      </span>
    </div>
  );
}
