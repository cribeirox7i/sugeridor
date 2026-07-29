import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSiteSettings } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_CONTAINER } from "@/lib/layout";
import Logo from "@/components/Logo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

// Cabeçalho comum das páginas públicas (logo + subtítulo + idioma + tema).
// Extraído da home quando a página "Todas as lojas" passou a precisar do mesmo
// topo — antes esse JSX vivia solto dentro de page.tsx.
//
// Busca `site_settings` por conta própria (é 1 linha singleton, e
// `getSiteSettings` já devolve null em vez de estourar se a migration 0004 não
// tiver rodado). A home passa o valor que ela já busca via `settings` pra não
// consultar duas vezes na mesma renderização.
export default async function SiteHeader({
  settings,
}: {
  settings?: Awaited<ReturnType<typeof getSiteSettings>>;
}) {
  const t = await getTranslations("home");
  let resolved = settings;
  if (resolved === undefined) {
    const supabase = await createClient();
    resolved = await getSiteSettings(supabase);
  }

  return (
    <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
      <div className={`${PUBLIC_CONTAINER} flex items-start justify-between py-6`}>
        {/* A logo leva pro catálogo — numa página que não é a home (ex.: /lojas)
            é o caminho de volta esperado. */}
        <Link href="/" className="min-w-0">
          <Logo settings={resolved} fallbackText={t("title")} className="h-8" />
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("subtitle")}</p>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
