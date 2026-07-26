import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/components/admin/DeleteButton";
import { addKeyword, deleteKeyword, reclassifyExistingProducts } from "./actions";

export const dynamic = "force-dynamic";

type KeywordRow = { id: string; category: string; keyword: string };

// Mesma ordem de prioridade do scraper (scraper/categorize.py) — cosmético
// aqui (a ordem de exibição não afeta a classificação), mas mantém a tela
// consistente com o raciocínio "kit antes de copo" explicado lá.
const CATEGORIES = ["eventos", "kit", "copo", "souvenirs"] as const;
const CATEGORY_LABEL_KEY: Record<(typeof CATEGORIES)[number], string> = {
  eventos: "categoryEventos",
  kit: "categoryKit",
  copo: "categoryCopo",
  souvenirs: "categorySouvenirs",
};

export default async function ClassificacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ reclassified?: string }>;
}) {
  const { reclassified } = await searchParams;
  const supabase = await createClient();
  const [t, tProd] = await Promise.all([
    getTranslations("admin.classification"),
    getTranslations("admin.products"),
  ]);

  const { data } = await supabase
    .from("category_keywords")
    .select("id, category, keyword")
    .order("keyword");
  const keywords = (data ?? []) as KeywordRow[];

  const byCategory = new Map<string, KeywordRow[]>(CATEGORIES.map((c) => [c, []]));
  for (const row of keywords) {
    byCategory.get(row.category)?.push(row);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("pageTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">{t("hint")}</p>
        </div>
        <form action={reclassifyExistingProducts} className="shrink-0">
          <button
            type="submit"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {t("reclassify")}
          </button>
        </form>
      </div>

      {reclassified !== undefined && (
        <p className="rounded bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {t("reclassifyResult", { count: Number(reclassified) })}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {CATEGORIES.map((category) => {
          const rows = byCategory.get(category) ?? [];
          return (
            <section
              key={category}
              className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h2 className="font-medium">{tProd(CATEGORY_LABEL_KEY[category])}</h2>

              <div className="flex flex-wrap gap-2">
                {rows.length === 0 && (
                  <p className="text-sm text-neutral-500 dark:text-neutral-600">{t("empty")}</p>
                )}
                {rows.map((row) => (
                  <span
                    key={row.id}
                    className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white pl-3 pr-1.5 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                  >
                    {row.keyword}
                    <DeleteButton
                      action={deleteKeyword}
                      id={row.id}
                      label="✕"
                      confirmMessage={t("confirmDelete", { keyword: row.keyword })}
                      className="rounded-full px-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-800 dark:hover:text-red-400"
                    />
                  </span>
                ))}
              </div>

              <form action={addKeyword} className="flex gap-2">
                <input type="hidden" name="category" value={category} />
                <input
                  name="keyword"
                  placeholder={t("addPlaceholder")}
                  className="flex-1 rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                />
                <button
                  type="submit"
                  className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
                >
                  {t("add")}
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
