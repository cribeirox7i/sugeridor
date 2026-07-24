"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

// Modal controlado por URL: o pai (Server Component) decide se renderiza isto
// ou não, baseado no searchParams (?new=1 ou ?edit=<id>). Fechar = navegar de
// volta pra URL sem esses parâmetros — sem estado de "aberto" duplicado.
export default function Modal({
  children,
  closeHref,
}: {
  children: React.ReactNode;
  closeHref: string;
}) {
  const router = useRouter();
  const close = () => router.push(closeHref);

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
      onClick={close}
    >
      <div
        className="max-h-[90vh] w-full max-w-[780px] overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
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
