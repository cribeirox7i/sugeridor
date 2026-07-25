"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PLATFORMS } from "@/lib/platforms";

// Dono do estado de site_url/platform/config/logo_url/description — precisam
// ficar juntos porque o botão "Detectar" lê a URL atual e escreve nos outros
// campos (inclusive logo/descrição, extraídos da home da loja).
export default function PlatformFields({
  defaultSiteUrl,
  defaultPlatform,
  defaultConfig,
  defaultLogoUrl,
  defaultDescription,
}: {
  defaultSiteUrl: string;
  defaultPlatform: string;
  defaultConfig: string;
  defaultLogoUrl: string;
  defaultDescription: string;
}) {
  const t = useTranslations("admin.stores");
  const [siteUrl, setSiteUrl] = useState(defaultSiteUrl);
  const [platform, setPlatform] = useState(defaultPlatform);
  const [config, setConfig] = useState(defaultConfig);
  const [logoUrl, setLogoUrl] = useState(defaultLogoUrl);
  const [description, setDescription] = useState(defaultDescription);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);

  const selected = PLATFORMS.find((p) => p.key === platform);
  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

  async function detect() {
    if (!siteUrl) return;
    setDetecting(true);
    setDetectMsg(null);
    try {
      const res = await fetch("/api/admin/detect-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: siteUrl }),
      });
      const data = await res.json();
      if (data.platform) {
        setPlatform(data.platform);
        setConfig(JSON.stringify(data.config ?? {}, null, 2));
        setDetectMsg(data.note ?? t("detectFound", { platform: data.platform }));
      } else {
        setPlatform("");
        setDetectMsg(data.note ?? t("detectNotFound"));
      }
      // Logo/descrição: só preenche o que ainda estiver vazio — nunca
      // sobrescreve o que o admin já preencheu à mão.
      if (data.logo_url) setLogoUrl((cur) => cur || data.logo_url);
      if (data.description) setDescription((cur) => cur || data.description);
    } catch {
      setDetectMsg(t("detectError"));
    } finally {
      setDetecting(false);
    }
  }

  return (
    <>
      <label className="space-y-1 sm:col-span-2">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("listingUrl")}</span>
        <div className="flex gap-2">
          <input
            name="site_url"
            type="url"
            placeholder="https://loja.com/cervejas?pagina=1"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            className={inputCls}
          />
          <button
            type="button"
            onClick={detect}
            disabled={detecting || !siteUrl}
            className="shrink-0 rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {detecting ? t("detecting") : t("detectButton")}
          </button>
        </div>
        {detectMsg && <span className="block text-xs text-amber-600 dark:text-amber-400">{detectMsg}</span>}
      </label>

      <label className="space-y-1">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("logo")}</span>
        <input
          name="logo_url"
          type="url"
          placeholder="https://..."
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="space-y-1">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("collectionField")}</span>
        <select
          name="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={inputCls}
        >
          <option value="">{t("collectionNone")}</option>
          {PLATFORMS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-500 dark:text-neutral-600">{t("configHint")}</span>
      </label>

      {selected && (
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("configField")} ({selected.label})
          </span>
          <textarea
            name="config"
            rows={6}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder={selected.configExample}
            className={`${inputCls} font-mono text-xs`}
          />
          <span className="text-xs text-neutral-500 dark:text-neutral-600">{selected.hint}</span>
        </label>
      )}

      <label className="space-y-1 sm:col-span-2">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("description")}</span>
        <textarea
          name="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls}
        />
      </label>
    </>
  );
}
