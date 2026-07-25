import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Store } from "@/lib/types";

// Cabeçalho da "página da loja" (home filtrada por ?loja=<id>): logo grande
// (fallback nome), descrição e botão de voltar. Some com filtros/carrossel
// de lojas/destaques, que só fazem sentido no catálogo geral.
export default async function StoreHeader({
  store,
}: {
  store: Pick<Store, "id" | "name" | "logo_url" | "description"> | null;
}) {
  const t = await getTranslations("home");

  if (!store) return null;

  return (
    <div className="space-y-3 border-b border-neutral-200 pb-6 dark:border-neutral-800">
      <Link
        href="/"
        className="mb-2 inline-block text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        {t("backToCatalog")}
      </Link>
      <div className="flex items-center gap-3">
        {store.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo_url} alt={store.name} className="h-12 w-12 rounded object-contain" />
        ) : null}
        <h1 className="text-2xl font-semibold">{store.name}</h1>
      </div>
      {store.description && (
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">{store.description}</p>
      )}
    </div>
  );
}
