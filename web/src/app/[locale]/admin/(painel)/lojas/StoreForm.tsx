"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PLATFORMS } from "@/lib/platforms";
import { STORE_COUNTRIES } from "@/lib/countries";

// Dono de TODOS os campos da loja, porque o botão "Detectar" escreve em vários
// deles de uma vez: plataforma, config, logo, descrição, nome e — no caso do
// VTEX — a própria URL de listagem (o coletor só aceita o endpoint da API de
// busca; a URL da página de categoria coleta 0 itens em silêncio).
//
// Layout em seções: o que identifica a loja, o que a coleta precisa, e um
// acordeon pro que é longo e raramente editado à mão (descrição e config JSON)
// — antes tudo isso ficava solto num grid só, o que embaralhava os campos.
export default function StoreForm({
  defaultName,
  defaultStoreType,
  defaultCountry,
  defaultSiteUrl,
  defaultPlatform,
  defaultConfig,
  defaultLogoUrl,
  defaultDescription,
  defaultExpirationDays,
  globalExpirationDays,
}: {
  defaultName: string;
  defaultStoreType: string;
  defaultCountry: string;
  defaultSiteUrl: string;
  defaultPlatform: string;
  defaultConfig: string;
  defaultLogoUrl: string;
  defaultDescription: string;
  // Vazio = herda o prazo global; `globalExpirationDays` só alimenta o
  // placeholder, pra deixar claro qual valor está valendo quando em branco.
  defaultExpirationDays: string;
  globalExpirationDays: number;
}) {
  const t = useTranslations("admin.stores");
  const [name, setName] = useState(defaultName);
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
  const labelCls = "text-sm text-neutral-500 dark:text-neutral-400";
  const sectionCls =
    "space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800";

  // País não vem do detector: uma loja .com.br pode vender marca importada, e
  // errar isso contamina a marca/país dos produtos de loja própria.
  const countries = STORE_COUNTRIES.includes(defaultCountry)
    ? STORE_COUNTRIES
    : [defaultCountry, ...STORE_COUNTRIES];

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
      // URL corrigida (VTEX) é aplicada de verdade: a URL informada não
      // funcionaria pro coletor, então não faz sentido só avisar.
      if (data.site_url) setSiteUrl(data.site_url);
      // Nome/logo/descrição: só preenchem o que ainda estiver vazio — nunca
      // sobrescrevem o que o admin já digitou à mão.
      if (data.name) setName((cur) => cur || data.name);
      if (data.logo_url) setLogoUrl((cur) => cur || data.logo_url);
      if (data.description) setDescription((cur) => cur || data.description);
    } catch {
      setDetectMsg(t("detectError"));
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className={sectionCls}>
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {t("sectionIdentity")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={labelCls}>{t("name")}</span>
            <input
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="space-y-1">
            <span className={labelCls}>{t("country")}</span>
            <select name="country" defaultValue={defaultCountry} className={inputCls}>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className={labelCls}>{t("storeType")}</span>
            <select name="store_type" defaultValue={defaultStoreType} className={inputCls}>
              <option value="marketplace">{t("storeTypeMarketplace")}</option>
              <option value="propria">{t("storeTypePropria")}</option>
            </select>
            <span className="text-xs text-neutral-500 dark:text-neutral-600">
              {t("storeTypeHint")}
            </span>
          </label>

          <label className="space-y-1">
            <span className={labelCls}>{t("expirationDays")}</span>
            <input
              name="offer_expiration_days"
              inputMode="numeric"
              defaultValue={defaultExpirationDays}
              placeholder={t("expirationPlaceholder", { days: globalExpirationDays })}
              className={inputCls}
            />
            <span className="text-xs text-neutral-500 dark:text-neutral-600">
              {t("expirationHint")}
            </span>
          </label>
        </div>
      </section>

      <section className={sectionCls}>
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {t("sectionCollection")}
        </h3>

        <label className="block space-y-1">
          <span className={labelCls}>{t("listingUrl")}</span>
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
          {detectMsg && (
            <span className="block text-xs text-amber-600 dark:text-amber-400">{detectMsg}</span>
          )}
        </label>

        <label className="block space-y-1">
          <span className={labelCls}>{t("collectionField")}</span>
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
      </section>

      {/* Descrição, logo e config JSON: longos e quase nunca digitados à mão
          (o "Detectar" preenche) — ficam recolhidos por padrão, abertos só se
          já houver algo preenchido pra revisar. */}
      <details
        className="rounded-lg border border-neutral-200 dark:border-neutral-800"
        open={Boolean(defaultLogoUrl || defaultDescription || defaultConfig)}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-600 dark:text-neutral-300">
          {t("sectionAdvanced")}
        </summary>
        <div className="space-y-4 border-t border-neutral-200 p-4 dark:border-neutral-800">
          <label className="block space-y-1">
            <span className={labelCls}>{t("logo")}</span>
            <input
              name="logo_url"
              type="url"
              placeholder="https://..."
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>{t("description")}</span>
            <textarea
              name="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls}
            />
          </label>

          {selected && (
            <label className="block space-y-1">
              <span className={labelCls}>
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
        </div>
      </details>
    </div>
  );
}
