import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PriceAlert } from "@/lib/types";
import Modal from "@/components/admin/Modal";
import DeleteButton from "@/components/admin/DeleteButton";
import { formatPrice, formatDateTime } from "@/lib/format";
import ScopeFields from "./ScopeFields";
import {
  saveAlert,
  toggleAlertActive,
  deleteAlert,
  saveOfferExpirationDays,
  saveAutomationSettings,
} from "./actions";
import { saveSiteSettings } from "./brandingActions";

export const dynamic = "force-dynamic";

type ProductLite = { id: string; name: string; brand: string | null };
type ProductTypeLite = { id: string; name: string };

type TriggerRow = {
  id: string;
  price_at_trigger: number;
  reference_price: number;
  drop_percent: number;
  triggered_at: string;
  offer: {
    product: { name: string; brand: string | null } | null;
    store: { name: string } | null;
  } | null;
};

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; error?: string }>;
}) {
  const { edit, new: isNew, error } = await searchParams;
  const supabase = await createClient();
  const [t, tCommon, tBranding] = await Promise.all([
    getTranslations("admin.config"),
    getTranslations("admin.common"),
    getTranslations("admin.branding"),
  ]);

  const [
    { data: alertsData },
    { data: productsData },
    { data: typesData },
    { data: triggersData },
    { data: siteSettingsData },
  ] = await Promise.all([
    supabase.from("price_alerts").select("*").order("created_at", { ascending: false }),
    supabase.from("products").select("id, name, brand").order("name"),
    supabase.from("product_types").select("id, name").order("name"),
    supabase
      .from("alert_triggers")
      .select(
        "id, price_at_trigger, reference_price, drop_percent, triggered_at, offer:offers ( product:products ( name, brand ), store:stores ( name ) )",
      )
      .order("triggered_at", { ascending: false })
      .limit(20),
    supabase
      .from("site_settings")
      .select(
        "offer_expiration_days, logo_black_url, logo_white_url, auto_apply_replacements, auto_merge_duplicates",
      )
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const alerts = (alertsData ?? []) as PriceAlert[];
  const products = (productsData ?? []) as ProductLite[];
  const productTypes = (typesData ?? []) as ProductTypeLite[];
  const triggers = (triggersData ?? []) as unknown as TriggerRow[];
  const offerExpirationDays = siteSettingsData?.offer_expiration_days ?? 45;
  // Ausentes (migration 0018 ainda não rodou nesse ambiente) = desligado, não
  // erro — mesmo espírito de getSiteSettings em queries.ts.
  const autoApplyReplacements = Boolean(
    (siteSettingsData as { auto_apply_replacements?: boolean } | null)?.auto_apply_replacements,
  );
  const autoMergeDuplicates = Boolean(
    (siteSettingsData as { auto_merge_duplicates?: boolean } | null)?.auto_merge_duplicates,
  );
  const siteSettings = siteSettingsData as
    | { logo_black_url: string | null; logo_white_url: string | null }
    | null;

  const productById = new Map(products.map((p) => [p.id, p]));
  const typeById = new Map(productTypes.map((pt) => [pt.id, pt]));

  function scopeLabel(alert: PriceAlert): string {
    if (alert.scope === "global") return t("scopeGlobal");
    if (alert.scope === "product") {
      const p = alert.scope_id ? productById.get(alert.scope_id) : undefined;
      return p ? (p.brand ? `${p.brand} — ${p.name}` : p.name) : t("scopeProduct");
    }
    const pt = alert.scope_id ? typeById.get(alert.scope_id) : undefined;
    return pt ? pt.name : t("scopeProductType");
  }

  const editing = edit ? alerts.find((a) => a.id === edit) : undefined;
  const showForm = Boolean(editing) || isNew === "1";

  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const labelCls = "text-sm text-neutral-500 dark:text-neutral-400";

  const form = (
    <form action={saveAlert} className="space-y-4">
      <h2 className="font-medium">{editing ? t("editTitle") : t("newTitle")}</h2>
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <ScopeFields
          defaultScope={editing?.scope ?? "global"}
          defaultScopeId={editing?.scope_id ?? ""}
          products={products}
          productTypes={productTypes}
        />

        <label className="space-y-1">
          <span className={labelCls}>{t("threshold")}</span>
          <input
            name="threshold_percent"
            required
            inputMode="decimal"
            defaultValue={editing?.threshold_percent ?? 15}
            placeholder="15"
            className={inputCls}
          />
          <span className="text-xs text-neutral-500 dark:text-neutral-600">{t("thresholdHint")}</span>
        </label>

        <label className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            name="active"
            defaultChecked={editing?.active ?? true}
            className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
          />
          <span className={labelCls}>{t("active")}</span>
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          {editing ? t("save") : t("add")}
        </button>
        <Link
          href="/admin/config"
          className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {t("cancel")}
        </Link>
      </div>
    </form>
  );

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">{t("pageTitle")}</h1>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium">{t("expirationTitle")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("expirationHint")}</p>
        </div>
        <form action={saveOfferExpirationDays} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className={labelCls}>{t("expirationDays")}</span>
            <input
              name="offer_expiration_days"
              required
              inputMode="numeric"
              defaultValue={offerExpirationDays}
              className={`${inputCls} w-28`}
            />
          </label>
          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {t("save")}
          </button>
        </form>
      </section>

      {/* Automação pós-coleta: aplica de/para e mescla duplicatas sozinho no
          fim de cada coleta (web/src/lib/postCollect.ts), na ordem
          substituição -> mesclagem -> ressincronização de slug. Exige os
          secrets SITE_BASE_URL/AUTOMATION_TOKEN no repositório do GitHub e
          SUPABASE_SERVICE_ROLE_KEY/AUTOMATION_TOKEN no Vercel — sem eles o
          passo do workflow só avisa e não roda nada (ver
          .github/workflows/scrape.yml). */}
      <section className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium">{t("automationTitle")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("automationHint")}</p>
        </div>
        <form action={saveAutomationSettings} className="space-y-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="auto_apply_replacements"
              defaultChecked={autoApplyReplacements}
              className="mt-1 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            <span>
              <span className="block">{t("autoApplyReplacements")}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-600">
                {t("autoApplyReplacementsHint")}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="auto_merge_duplicates"
              defaultChecked={autoMergeDuplicates}
              className="mt-1 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            <span>
              <span className="block">{t("autoMergeDuplicates")}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-600">
                {t("autoMergeDuplicatesHint")}
              </span>
            </span>
          </label>
          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {t("save")}
          </button>
        </form>
      </section>

      {/* Logomarca: veio da tela /admin/logomarca, que era só este formulário
          e deixou de existir — é configuração do site, como as demais aqui. */}
      <section className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-medium">{tBranding("title")}</h2>
        <form action={saveSiteSettings} className="max-w-xl space-y-5">
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className={labelCls}>{tBranding("blackLabel")}</span>
              <input
                name="logo_black_url"
                type="url"
                placeholder="https://.../logo-preta.png"
                defaultValue={siteSettings?.logo_black_url ?? ""}
                className={inputCls}
              />
            </label>
            {siteSettings?.logo_black_url && (
              <div className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800">
                <p className="mb-2 text-xs text-neutral-500">{tBranding("preview")}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={siteSettings.logo_black_url} alt="" className="h-10" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block space-y-1">
              <span className={labelCls}>{tBranding("whiteLabel")}</span>
              <input
                name="logo_white_url"
                type="url"
                placeholder="https://.../logo-branca.png"
                defaultValue={siteSettings?.logo_white_url ?? ""}
                className={inputCls}
              />
            </label>
            {siteSettings?.logo_white_url && (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <p className="mb-2 text-xs text-neutral-400">{tBranding("preview")}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={siteSettings.logo_white_url} alt="" className="h-10" />
              </div>
            )}
          </div>

          {!siteSettings?.logo_black_url && !siteSettings?.logo_white_url && (
            <p className="text-sm text-neutral-500">{tBranding("noLogo")}</p>
          )}

          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
          >
            {tBranding("save")}
          </button>
        </form>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{t("title")}</h2>
        <Link
          href="/admin/config?new=1"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          + {tCommon("include")}
        </Link>
      </div>

      {error === "delete-blocked" && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("deleteBlocked")}
        </p>
      )}

      {showForm && <Modal closeHref="/admin/config">{form}</Modal>}

      {alerts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
          {t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h3 className="text-sm font-medium leading-tight">{scopeLabel(a)}</h3>
              <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                -{a.threshold_percent}%
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <form action={toggleAlertActive}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={String(a.active)} />
                  <button
                    type="submit"
                    className={
                      a.active
                        ? "rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/50 dark:text-green-300"
                        : "rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                    }
                  >
                    {a.active ? t("active") : t("inactive")}
                  </button>
                </form>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/config?edit=${a.id}`}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    {t("edit")}
                  </Link>
                  <DeleteButton
                    action={deleteAlert}
                    id={a.id}
                    label={t("delete")}
                    confirmMessage={t("confirmDelete")}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t("recentTriggersTitle")}</h2>
        {triggers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
            {t("triggersEmpty")}
          </p>
        ) : (
          // overflow-x-auto (não hidden) — ver comentário em StoresTable.tsx.
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-[13px]">
              <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("colProduct")}</th>
                  <th className="px-4 py-2 font-medium">{t("colStore")}</th>
                  <th className="px-4 py-2 font-medium">{t("colDrop")}</th>
                  <th className="px-4 py-2 font-medium">{t("colPrice")}</th>
                  <th className="px-4 py-2 font-medium">{t("colDate")}</th>
                </tr>
              </thead>
              <tbody>
                {triggers.map((tr) => {
                  const product = tr.offer?.product;
                  const label = product?.brand ? `${product.brand} — ${product.name}` : product?.name ?? "—";
                  return (
                    <tr key={tr.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="px-4 py-2">{label}</td>
                      <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                        {tr.offer?.store?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                          -{Math.round(tr.drop_percent)}%
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {formatPrice(tr.price_at_trigger)}
                        </span>
                        <span className="ml-1 text-xs text-neutral-400 line-through">
                          {formatPrice(tr.reference_price)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                        {formatDateTime(tr.triggered_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
