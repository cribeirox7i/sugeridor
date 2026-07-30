"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleProductHidden } from "./actions";

// Checkbox instantâneo (sem abrir o formulário) — mesmo padrão de
// StoresTable.tsx pro toggle de "Ativa"/"Incluir na coleta": chama a Server
// Action direto no onChange, via startTransition, em vez de um <form> com
// botão. Trocado de botão-tag pra checkbox a pedido do usuário — o botão
// colorido ("visível"/"oculto") parecia uma etiqueta de status, não um
// controle.
export default function HiddenToggle({ id, hidden }: { id: string; hidden: boolean }) {
  const t = useTranslations("admin.products");
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={!hidden}
        disabled={isPending}
        onChange={() => startTransition(() => toggleProductHidden(id, hidden))}
        className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
      />
      <span className="text-xs text-neutral-500">{hidden ? t("hiddenOn") : t("hiddenOff")}</span>
    </label>
  );
}
