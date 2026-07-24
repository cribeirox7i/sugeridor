"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function ThemeToggle() {
  const t = useTranslations("theme");
  // Evita mismatch de hidratação: só sabe o estado real depois de montar (o
  // servidor já decidiu a classe inicial via cookie, isso só sincroniza o ícone).
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.cookie = `theme=${next ? "dark" : "light"}; path=/; max-age=31536000; SameSite=Lax`;
    setIsDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={t("toggle")}
      className="rounded border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
    >
      {isDark === null ? (
        <span className="block h-4 w-4" />
      ) : isDark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}
