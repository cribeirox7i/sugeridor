import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listOffers, storesForShowcase, getSiteSettings } from "@/lib/queries";
import { PUBLIC_CONTAINER } from "@/lib/layout";
import SiteHeader from "@/components/SiteHeader";
import Footer from "@/components/Footer";
import ViewToggle from "@/components/admin/ViewToggle";
import StoreLogo from "@/components/StoreLogo";

export const dynamic = "force-dynamic";

// Vitrine pública das lojas. É a versão só-leitura da lista de lojas do admin:
// nome, logo, descrição e quantos produtos a loja tem em oferta — sem nada de
// gestão (plataforma de coleta, editar, excluir, detectar, incluir na coleta).
//
// `ViewToggle` (cartões/lista) vem de components/admin: é genérico, mexe apenas
// na query string, e já existe o precedente do Modal sendo compartilhado entre
// admin e público.
export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("stores");

  const [offers, siteSettings] = await Promise.all([
    listOffers(supabase),
    getSiteSettings(supabase),
  ]);
  const stores = await storesForShowcase(supabase, offers);

  // Mesma convenção das telas do admin: sem `?view=` na URL, mostra lista.
  const isList = view !== "grid";

  return (
    <div className="flex min-h-dvh flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <SiteHeader settings={siteSettings} />

      <div className="flex-1">
        <div className={`${PUBLIC_CONTAINER} space-y-5 py-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{t("pageTitle")}</h1>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {t("pageHint", { count: stores.length })}
              </p>
            </div>
            <ViewToggle defaultView="list" />
          </div>

          {stores.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-neutral-800">
              {t("empty")}
            </div>
          ) : isList ? (
            <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              {stores.map((store, i) => (
                <Link
                  key={store.id}
                  href={`/?loja=${store.id}`}
                  className={`flex items-start gap-3 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                    i > 0 ? "border-t border-neutral-200 dark:border-neutral-800" : ""
                  }`}
                >
                  {store.logo_url ? (
                    <StoreLogo src={store.logo_url} alt="" size="h-10 w-10" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-100 text-lg dark:bg-neutral-800">
                      🍺
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{store.name}</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {t("productCount", { count: store.productCount })}
                      </span>
                    </div>
                    {store.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                        {store.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <Link
                  key={store.id}
                  href={`/?loja=${store.id}`}
                  className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center gap-2">
                    {store.logo_url ? (
                      <StoreLogo src={store.logo_url} alt="" size="h-8 w-8" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-100 dark:bg-neutral-800">
                        🍺
                      </span>
                    )}
                    <h2 className="min-w-0 truncate font-medium">{store.name}</h2>
                  </div>
                  {store.description && (
                    <p className="line-clamp-3 text-sm text-neutral-500 dark:text-neutral-400">
                      {store.description}
                    </p>
                  )}
                  <span className="mt-auto text-xs text-amber-700 dark:text-amber-500">
                    {t("productCount", { count: store.productCount })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
