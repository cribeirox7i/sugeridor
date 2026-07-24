import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/types";
import { saveStore, deleteStore } from "./actions";
import PlatformFields from "./PlatformFields";

export const dynamic = "force-dynamic";

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; error?: string }>;
}) {
  const { edit, error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("*").order("name");
  const stores = (data ?? []) as Store[];
  const editing = edit ? stores.find((s) => s.id === edit) : undefined;
  const t = await getTranslations("admin.stores");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
      </div>

      <form
        action={saveStore}
        className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h2 className="font-medium">{editing ? t("editTitle") : t("newTitle")}</h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}

        {error === "config-invalido" && (
          <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {t("configInvalid")}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("name")}</span>
            <input
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("listingUrl")}
            </span>
            <input
              name="site_url"
              type="url"
              placeholder="https://loja.com/cervejas?pagina=1"
              defaultValue={editing?.site_url ?? ""}
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>

          <PlatformFields
            defaultPlatform={editing?.platform ?? ""}
            defaultConfig={
              editing?.config && Object.keys(editing.config).length > 0
                ? JSON.stringify(editing.config, null, 2)
                : ""
            }
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {editing ? t("save") : t("add")}
          </button>
          {editing && (
            <Link
              href="/admin/lojas"
              className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {t("cancel")}
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">{t("nameColumn")}</th>
              <th className="px-4 py-2 font-medium">{t("site")}</th>
              <th className="px-4 py-2 font-medium">{t("collectionColumn")}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                  {t("empty")}
                </td>
              </tr>
            )}
            {stores.map((s) => (
              <tr key={s.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-4 py-2">{s.name}</td>
                <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                  {s.site_url ? (
                    <a
                      href={s.site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      {s.site_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{s.platform ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/lojas?edit=${s.id}`}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {t("edit")}
                    </Link>
                    <form action={deleteStore}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        {t("delete")}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
