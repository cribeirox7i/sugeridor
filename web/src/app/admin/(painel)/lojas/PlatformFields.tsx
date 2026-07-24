"use client";

import { useState } from "react";
import { PLATFORMS } from "@/lib/platforms";

export default function PlatformFields({
  defaultPlatform,
  defaultConfig,
}: {
  defaultPlatform: string;
  defaultConfig: string;
}) {
  const [platform, setPlatform] = useState(defaultPlatform);
  const selected = PLATFORMS.find((p) => p.key === platform);
  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

  return (
    <>
      <label className="space-y-1">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">Coleta automática</span>
        <select
          name="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={inputCls}
        >
          <option value="">Nenhuma (só cadastro manual)</option>
          {PLATFORMS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-500 dark:text-neutral-600">
          As ofertas coletadas ficam marcadas com origem <code>scrape</code>; a origem de cada
          oferta é registrada automaticamente por oferta, não pela loja.
        </span>
      </label>

      {selected && (
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Config ({selected.label})</span>
          <textarea
            name="config"
            rows={6}
            defaultValue={defaultConfig}
            placeholder={selected.configExample}
            className={`${inputCls} font-mono text-xs`}
          />
          <span className="text-xs text-neutral-500 dark:text-neutral-600">{selected.hint}</span>
        </label>
      )}
    </>
  );
}
