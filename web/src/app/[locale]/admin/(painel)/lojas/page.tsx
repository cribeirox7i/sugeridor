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
import StoresTable from "./StoresTable";
import RunScrapeButton from "./RunScrapeButton";
import DetectPlatformCardButton from "./DetectPlatformCardButton";

export const dynamic = "force-dynamic";

type Job = {
  id: string;
  status: "running" | "success" | "partial" | "failed";
  items_found: number;
  items_new: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  store: { name: string } | null;
};

const STATUS_STYLE: Record<Job["status"], string> = {
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  success: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

function fmtDate(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; error?: string; q?: string; view?: string }>;
}) {
  const { edit, new: isNew, error, q, view } = await searchParams;
  const supabase = await createClient();
  // A tela Coleta foi absorvida aqui, então o histórico de execuções
  // (ingestion_jobs) também é carregado nesta página.
  const [{ data }, { data: settings }, { data: jobsData }] = await Promise.all([
    supabase.from("stores").select("*").order("name"),
    supabase.from("site_settings").select("offer_expiration_days").eq("id", 1).maybeSingle(),
    supabase
      .from("ingestion_jobs")
      .select("*, store:stores ( name )")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);
  const allStores = (data ?? []) as Store[];
  const globalExpirationDays = settings?.offer_expiration_days ?? 45;
  const jobs = (jobsData ?? []) as unknown as Job[];
  // Contagem correta: a tela antiga contava lojas com `platform` definido, o
  // que superestimava quando alguma estava desmarcada.
  const includedCount = allStores.filter((s) => s.platform && s.include_in_collection).length;
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
        defaultExpirationDays={
          editing?.offer_expiration_days ? String(editing.offer_expiration_days) : ""
        }
        globalExpirationDays={globalExpirationDays}
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
        <StoresTable stores={stores} deleteStore={deleteStore} />
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

      {/* ── Coleta: veio da tela /admin/coleta, que deixou de existir ── */}
      <section className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium">{t("runTitle")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("runHint")}</p>
        </div>
        <RunScrapeButton />
        <p className="border-t border-neutral-200 pt-3 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          {t("storesIncluded", { count: includedCount })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t("lastRuns")}</h2>
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-[13px]">
            <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">{t("nameColumn")}</th>
                <th className="px-4 py-2 font-medium">{t("statusColumn")}</th>
                <th className="px-4 py-2 font-medium">{t("offersColumn")}</th>
                <th className="px-4 py-2 font-medium">{t("newColumn")}</th>
                <th className="px-4 py-2 font-medium">{t("startColumn")}</th>
                <th className="px-4 py-2 font-medium">{t("endColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                    {t("noRuns")}
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr
                  key={j.id}
                  className="border-t border-neutral-200 align-top dark:border-neutral-800"
                >
                  <td className="px-4 py-2">{j.store?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[j.status]}`}>
                      {j.status}
                    </span>
                    {j.error_message && (
                      <div className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">
                        {j.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">{j.items_found}</td>
                  <td className="px-4 py-2">{j.items_new}</td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                    {fmtDate(j.started_at)}
                  </td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                    {fmtDate(j.finished_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
