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

  // "Início" foi removida (cada tela agora mostra a própria contagem, ver
  // lojas/produtos/ofertas page.tsx) — a raiz /admin só redireciona pra Lojas.
  // Config foi pro FIM da lista — é a tela menos acessada no dia a dia.
  const NAV = [
    { href: "/admin/lojas", label: t("stores") },
    { href: "/admin/produtos", label: t("products") },
    // Item 1 da leva de melhorias: catálogo normalizado de marcas (nome +
    // país), autoridade sobre products.brand.
    { href: "/admin/marcas", label: t("brands") },
    { href: "/admin/ofertas", label: t("offers") },
    { href: "/admin/classificacao", label: t("classification") },
    // A tela Coleta foi absorvida por Lojas (tudo lá era sobre lojas: disparo,
    // quais entram na coleta e histórico de execuções).
    { href: "/admin/ferramentas", label: t("tools") },
    // Logomarca virou uma seção de Config (era só um formulário).
    { href: "/admin/config", label: t("config") },
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* shrink-0 + só o <main> rola abaixo — navbar nunca sai de vista. */}
      <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-[1140px] items-center gap-3 px-6 py-3">
          {/* 7 abas não cabem em tela de celular — sem `overflow-x-auto` elas
              simplesmente saíam da viewport sem nenhum jeito de alcançar,
              nem rolando nem apertando (bug reportado no site, achado aqui
              no admin). `min-w-0` é o que deixa o flex item de fato encolher
              e rolar em vez de esticar; os links ganham `shrink-0` pra não
              quebrar palavra nem espremer. */}
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="mr-3 shrink-0 font-semibold">Sugeridor</span>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded px-3 py-1.5 text-sm whitespace-nowrap text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
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
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1140px] px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
