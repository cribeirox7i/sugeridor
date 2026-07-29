import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Store } from "@/lib/types";

// Cabeçalho da "página da loja" (home filtrada por ?loja=<id>).
//
// Logo à ESQUERDA e nome+descrição numa coluna à direita: antes a descrição
// ficava embaixo de tudo e o bloco comia três faixas verticais (voltar, logo,
// descrição) antes do primeiro produto aparecer.
export default async function StoreHeader({
  store,
  offerCount,
}: {
  store: Pick<Store, "id" | "name" | "logo_url" | "description"> | null;
  offerCount?: number;
}) {
  const t = await getTranslations("home");

  if (!store) return null;

  return (
    <div className="flex items-start gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
      {store.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={store.logo_url}
          alt={store.name}
          className="h-16 w-16 shrink-0 rounded object-contain"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold">{store.name}</h1>
          {offerCount !== undefined && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("offerCount", { count: offerCount })}
            </span>
          )}
        </div>
        {store.description && (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{store.description}</p>
        )}
        <Link
          href="/lojas"
          className="mt-1 inline-block text-xs text-amber-700 hover:underline dark:text-amber-500"
        >
          {t("allStores")}
        </Link>
      </div>
    </div>
  );
}
