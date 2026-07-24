import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// Sempre escuro (barra preta), independente do tema claro/escuro do site —
// pedido explícito, funciona como assinatura visual fixa da marca.
export default async function Footer() {
  const t = await getTranslations("footer");

  return (
    <footer className="mt-auto bg-neutral-950 text-neutral-400">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-lg font-semibold text-neutral-100">Sugeridor</p>
            <p className="mt-2 max-w-sm text-sm">{t("tagline")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("menuTitle")}
            </p>
            <nav className="mt-2 flex flex-col gap-1 text-sm">
              <Link href="/" className="hover:text-neutral-100">
                {t("catalog")}
              </Link>
              <Link href="/sobre" className="hover:text-neutral-100">
                {t("about")}
              </Link>
              <Link href="/termos" className="hover:text-neutral-100">
                {t("terms")}
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-8 border-t border-neutral-800 pt-6 text-xs">
          © {new Date().getFullYear()} Sugeridor. {t("rights")}
        </div>
      </div>
    </footer>
  );
}
