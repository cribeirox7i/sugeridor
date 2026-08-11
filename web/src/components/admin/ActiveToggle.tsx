"use client";

import { useRef } from "react";

type ServerAction = (formData: FormData) => void | Promise<void>;

// Checkbox que envia o form assim que muda — sem isto o toggle de
// ativo/inativo parecia uma tag de status (cor sólida, sem contorno) em vez
// de um controle, e quem via a linha "apagada" (regra inativa) achava que não
// dava pra clicar nela pra reativar.
export default function ActiveToggle({
  action,
  id,
  active,
  label,
}: {
  action: ServerAction;
  id: string;
  active: boolean;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(active)} />
      <input
        type="checkbox"
        checked={active}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-green-600 focus:ring-green-500 dark:border-neutral-600"
        aria-label={label}
      />
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
    </form>
  );
}
