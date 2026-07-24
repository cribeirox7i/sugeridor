import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/queries";
import { saveSiteSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function LogomarcaPage() {
  const supabase = await createClient();
  const [settings, t] = await Promise.all([
    getSiteSettings(supabase),
    getTranslations("admin.branding"),
  ]);

  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      <form action={saveSiteSettings} className="space-y-6">
        <div className="space-y-2">
          <label className="space-y-1 block">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("blackLabel")}</span>
            <input
              name="logo_black_url"
              type="url"
              placeholder="https://.../logo-preta.png"
              defaultValue={settings?.logo_black_url ?? ""}
              className={inputCls}
            />
          </label>
          {settings?.logo_black_url && (
            <div className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800">
              <p className="mb-2 text-xs text-neutral-500">{t("preview")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={settings.logo_black_url} alt="" className="h-10" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="space-y-1 block">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("whiteLabel")}</span>
            <input
              name="logo_white_url"
              type="url"
              placeholder="https://.../logo-branca.png"
              defaultValue={settings?.logo_white_url ?? ""}
              className={inputCls}
            />
          </label>
          {settings?.logo_white_url && (
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <p className="mb-2 text-xs text-neutral-400">{t("preview")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={settings.logo_white_url} alt="" className="h-10" />
            </div>
          )}
        </div>

        {!settings?.logo_black_url && !settings?.logo_white_url && (
          <p className="text-sm text-neutral-500">{t("noLogo")}</p>
        )}

        <button
          type="submit"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          {t("save")}
        </button>
      </form>
    </div>
  );
}
