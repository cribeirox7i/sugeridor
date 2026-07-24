"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = { kind: "idle" | "loading" | "ok" | "error"; msg?: string };

export default function RunScrapeButton() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const router = useRouter();

  async function run() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/scrape", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setState({
          kind: "ok",
          msg: "Coleta disparada! Acompanhe o resultado abaixo (atualize em ~1 min).",
        });
        // dá um tempo pro job 'running' aparecer e recarrega a lista
        setTimeout(() => router.refresh(), 4000);
      } else {
        setState({ kind: "error", msg: data.error ?? "Falha ao disparar." });
      }
    } catch {
      setState({ kind: "error", msg: "Erro de rede ao chamar a API." });
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={state.kind === "loading"}
        className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 dark:text-neutral-950"
      >
        {state.kind === "loading" ? "Disparando..." : "Rodar coleta agora"}
      </button>
      {state.msg && (
        <p
          className={
            state.kind === "error"
              ? "text-sm text-red-600 dark:text-red-400"
              : "text-sm text-green-600 dark:text-green-400"
          }
        >
          {state.msg}
        </p>
      )}
    </div>
  );
}
