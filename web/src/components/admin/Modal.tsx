"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { MODAL_FROM_GRID_KEY } from "@/lib/modalNav";

// Modal controlado por URL: o pai (Server Component) decide se renderiza isto
// ou não, baseado no searchParams (?new=1 ou ?edit=<id>). Fechar = navegar de
// volta pra URL sem esses parâmetros — sem estado de "aberto" duplicado.
export default function Modal({
  children,
  closeHref,
  instantClose,
  dismissOnBackdrop = false,
}: {
  children: React.ReactNode;
  closeHref: string;
  // Só o popup de produto na home passa isso (ver ProductCardLink.tsx) —
  // permite fechar com router.back() quando foi aberto por clique no grid,
  // reaproveitando o cache client-side do router em vez de forçar um novo
  // carregamento da home via push. Modais do admin não passam essa prop e
  // continuam fechando com push, como sempre.
  instantClose?: boolean;
  // Clicar no fundo escuro fecha? Padrão NÃO: nos modais de cadastro/edição do
  // admin um clique fora perdia tudo que tinha sido digitado no formulário.
  // O popup público de produto passa `true` — ali fechar por clique fora é o
  // comportamento esperado de uma espiada, e não há nada a perder.
  dismissOnBackdrop?: boolean;
}) {
  const router = useRouter();
  const close = () => {
    if (instantClose && sessionStorage.getItem(MODAL_FROM_GRID_KEY)) {
      sessionStorage.removeItem(MODAL_FROM_GRID_KEY);
      router.back();
      return;
    }
    router.push(closeHref);
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeHref]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={dismissOnBackdrop ? close : undefined}
    >
      {/* stopPropagation só é necessário quando o fundo fecha — sem ele, um
          clique dentro do painel borbulharia até o backdrop. */}
      <div
        className="max-h-[90vh] w-full max-w-[780px] overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900"
        onClick={dismissOnBackdrop ? (e) => e.stopPropagation() : undefined}
      >
        <div className="mb-2 flex justify-end">
          <button
            onClick={close}
            aria-label="Fechar"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
