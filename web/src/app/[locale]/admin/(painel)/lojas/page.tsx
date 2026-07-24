import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/types";
import Modal from "@/components/admin/Modal";
import { saveStore, deleteStore } from "./actions";
import PlatformFields from "./PlatformFields";

export const dynamic = "force-dynamic";

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; error?: string }>;
}) {
  const { edit, new: isNew, error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("*").order("name");
  const stores = (data ?? []) as Store[];
  const editing = edit ? stores.find((s) => s.id === edit) : undefined;
  const showForm = Boolean(editing) || isNew === "1";
  const [t, tCommon] = await Promise.all([
    getTranslations("admin.stores"),
    getTranslations("admin.common"),
  ]);

  const form = (
    <form
      action={saveStore}
      className="space-y-4"
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
          <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("listingUrl")}</span>
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
        <Link
          href="/admin/lojas"
          className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {t("cancel")}
        </Link>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Link
          href="/admin/lojas?new=1"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          + {tCommon("include")}
        </Link>
      </div>

      {showForm && (
        <Modal closeHref="/admin/lojas">
          {form}
        </Modal>
      )}

      {stores.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
          {t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{s.name}</h3>
                {s.platform && (
                  <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {s.platform}
                  </span>
                )}
              </div>
              {s.site_url && (
                <a
                  href={s.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  {s.site_url}
                </a>
              )}
              <div className="mt-auto flex gap-2 pt-2">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
