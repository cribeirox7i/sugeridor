import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/types";
import Modal from "@/components/admin/Modal";
import DeleteButton from "@/components/admin/DeleteButton";
import ViewToggle from "@/components/admin/ViewToggle";
import SearchBox from "@/components/admin/SearchBox";
import { saveStore, deleteStore } from "./actions";
import StoreForm from "./StoreForm";
import DetectPlatformCardButton from "./DetectPlatformCardButton";

export const dynamic = "force-dynamic";

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; error?: string; q?: string; view?: string }>;
}) {
  const { edit, new: isNew, error, q, view } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("*").order("name");
  const allStores = (data ?? []) as Store[];
  const stores = q
    ? allStores.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    : allStores;
  const editing = edit ? allStores.find((s) => s.id === edit) : undefined;
  const showForm = Boolean(editing) || isNew === "1";
  const isList = view !== "grid";
  const [t, tCommon] = await Promise.all([
    getTranslations("admin.stores"),
    getTranslations("admin.common"),
  ]);

  const form = (
    <form action={saveStore} className="space-y-4">
      <h2 className="font-medium">{editing ? t("editTitle") : t("newTitle")}</h2>
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <StoreForm
        defaultName={editing?.name ?? ""}
        defaultStoreType={editing?.store_type ?? "marketplace"}
        defaultCountry={editing?.country ?? "Brasil"}
        defaultSiteUrl={editing?.site_url ?? ""}
        defaultPlatform={editing?.platform ?? ""}
        defaultConfig={
          editing?.config && Object.keys(editing.config).length > 0
            ? JSON.stringify(editing.config, null, 2)
            : ""
        }
        defaultLogoUrl={editing?.logo_url ?? ""}
        defaultDescription={editing?.description ?? ""}
      />

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Link
          href="/admin/lojas?new=1"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          + {tCommon("include")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox placeholder={t("searchPlaceholder")} defaultValue={q} view={view} />
        <ViewToggle defaultView="list" />
      </div>

      {error === "config-invalido" && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("configInvalid")}
        </p>
      )}
      {error === "delete-blocked" && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("deleteBlocked")}
        </p>
      )}
      {error === "save-failed" && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("saveFailed")}
        </p>
      )}

      {showForm && <Modal closeHref="/admin/lojas">{form}</Modal>}

      {stores.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
          {t("empty")}
        </p>
      ) : isList ? (
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-[13px]">
            <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">{t("nameColumn")}</th>
                <th className="px-4 py-2 font-medium">{t("site")}</th>
                <th className="px-4 py-2 font-medium">{t("collectionColumn")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
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
                      <DetectPlatformCardButton storeId={s.id} siteUrl={s.site_url} />
                      <Link
                        href={`/admin/lojas?edit=${s.id}`}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        {t("edit")}
                      </Link>
                      <DeleteButton
                        action={deleteStore}
                        id={s.id}
                        label={t("delete")}
                        confirmMessage={t("confirmDelete", { name: s.name })}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {s.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo_url} alt="" className="h-6 w-6 rounded object-contain" />
                  )}
                  <h3 className="font-medium">{s.name}</h3>
                </div>
                {s.platform && (
                  <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {s.platform}
                  </span>
                )}
              </div>
              {s.description && (
                <p className="line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {s.description}
                </p>
              )}
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
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <DetectPlatformCardButton storeId={s.id} siteUrl={s.site_url} />
                <Link
                  href={`/admin/lojas?edit=${s.id}`}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {t("edit")}
                </Link>
                <DeleteButton
                  action={deleteStore}
                  id={s.id}
                  label={t("delete")}
                  confirmMessage={t("confirmDelete", { name: s.name })}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
