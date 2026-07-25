import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { signOut } from "./actions";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [t, locale] = await Promise.all([getTranslations("nav"), getLocale()]);

  // Defesa extra além do proxy: sem usuário, fora.
  if (!user) redirect(`/${locale}/admin/login`);

  const NAV = [
    { href: "/admin", label: t("home") },
    { href: "/admin/lojas", label: t("stores") },
    { href: "/admin/produtos", label: t("products") },
    { href: "/admin/ofertas", label: t("offers") },
    { href: "/admin/config", label: t("config") },
    { href: "/admin/coleta", label: t("collection") },
    { href: "/admin/logomarca", label: t("branding") },
  ];

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-[1140px] items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-1">
            <span className="mr-3 font-semibold">Sugeridor</span>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-500 sm:inline">{user.email}</span>
            <LanguageSwitcher />
            <ThemeToggle />
            <form action={signOut}>
              <button
                type="submit"
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                {t("signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1140px] px-6 py-8">{children}</main>
    </div>
  );
}
