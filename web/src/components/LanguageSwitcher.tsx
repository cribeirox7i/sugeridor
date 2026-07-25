"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const FLAGS: Record<string, string> = {
  pt: "🇧🇷",
  en: "🇺🇸",
  es: "🇪🇸",
};

const LABELS: Record<string, string> = {
  pt: "PT",
  en: "EN",
  es: "ES",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("language");

  function onChange(nextLocale: string) {
    // Preserva a query string atual (ex: ?loja=<id> na "página da loja",
    // filtros na home) — sem isso, trocar de idioma sempre voltava pra "/",
    // perdendo onde o usuário estava.
    const qs = searchParams.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: nextLocale });
  }

  return (
    <select
      aria-label={t("label")}
      value={locale}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {FLAGS[l]} {LABELS[l]}
        </option>
      ))}
    </select>
  );
}
