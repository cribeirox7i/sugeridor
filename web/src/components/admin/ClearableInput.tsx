"use client";

import { useId, useState } from "react";

type Common = {
  name: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  inputMode?: React.ComponentProps<"input">["inputMode"];
  type?: string;
  rows?: number;
  clearLabel?: string;
};

// Campo de texto com botão ✕ para limpar o conteúdo.
//
// Híbrido de propósito: aceita `value`/`onChange` (controlado pelo pai) OU só
// `defaultValue` (gerencia o próprio estado). Os dois modos são necessários
// porque as telas do admin usam padrões diferentes — o formulário de loja tem
// campos controlados porque o botão "Detectar" escreve neles de fora, enquanto
// os formulários de produto e de oferta são renderizados no servidor e usam
// `defaultValue`.
//
// Funciona dentro de um `<form>` de Server Component: o `name` continua no DOM,
// então a Server Action lê o valor normalmente — não precisa transformar o
// formulário inteiro em client component só por causa do botão de limpar.
export default function ClearableInput({
  value,
  defaultValue,
  onChange,
  multiline,
  wrapperClassName,
  ...rest
}: Common & {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  multiline?: boolean;
  // O ✕ precisa de um ancestral posicionado, então o campo ganha um wrapper.
  // Quando o campo vive dentro de um flex (caso da URL de listagem, que divide
  // a linha com o botão "Detectar"), o wrapper é que precisa receber o
  // `flex-1` — senão encolhe para o tamanho do conteúdo.
  wrapperClassName?: string;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const fallbackId = useId();
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  function update(next: string) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }

  const { className, clearLabel, rows, type, ...fieldProps } = rest;
  // pr-8 abre espaço pro ✕ não cobrir o texto digitado.
  const cls = `${className ?? ""} pr-8`.trim();

  return (
    <span className={`relative block ${wrapperClassName ?? ""}`}>
      {multiline ? (
        <textarea
          {...fieldProps}
          id={fieldProps.name || fallbackId}
          rows={rows}
          value={current}
          onChange={(e) => update(e.target.value)}
          className={cls}
        />
      ) : (
        <input
          {...fieldProps}
          id={fieldProps.name || fallbackId}
          type={type ?? "text"}
          value={current}
          onChange={(e) => update(e.target.value)}
          className={cls}
        />
      )}

      {current !== "" && (
        <button
          type="button"
          onClick={() => update("")}
          aria-label={clearLabel ?? "Limpar"}
          title={clearLabel ?? "Limpar"}
          // top-2 (e não inset-y-0) pro botão ficar na PRIMEIRA linha do
          // textarea, não centralizado verticalmente num campo alto.
          className="absolute right-1.5 top-2 rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          ✕
        </button>
      )}
    </span>
  );
}
