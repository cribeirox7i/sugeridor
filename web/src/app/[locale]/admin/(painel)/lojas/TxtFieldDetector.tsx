"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { parsePriceLoose } from "@/lib/parseTxtConfig";

type PreviewRow = Partial<Record<"NOM" | "PRC" | "IMG" | "URL" | "MARCA" | "PAIS" | "ESTILO", string>>;

type DetectResponse = {
  config: { fields: unknown[]; max_items: number } | null;
  preview: { rows: PreviewRow[]; count: number; broken: boolean; warnings: string[] } | null;
  usedAutoSample: boolean;
  needsManualSample: boolean;
  missingRequired: ("nome" | "preco")[];
  warnings: string[];
  error?: string;
};

type ManualSample = {
  nome: string;
  preco: string;
  marca: string;
  pais: string;
  estilo: string;
  urlProduto: string;
  urlImagem: string;
};

const EMPTY_MANUAL: ManualSample = {
  nome: "",
  preco: "",
  marca: "",
  pais: "",
  estilo: "",
  urlProduto: "",
  urlImagem: "",
};

// Painel de detecção automática pra platform="txt" (coletor posicional
// find/mid — ver scraper/platforms/txt.py). Duas camadas, na ordem desenhada
// com o usuário: tenta primeiro o último produto já coletado desta loja
// (sem o admin digitar nada); só pede exemplo manual se não houver produto
// anterior ou se a tentativa automática não bater na página — ver
// web/src/app/api/admin/detect-txt-fields/route.ts.
export default function TxtFieldDetector({
  storeId,
  siteUrl,
  storeType,
  brandAlias,
  storeName,
  onConfigDetected,
}: {
  storeId?: string;
  siteUrl: string;
  storeType: string;
  brandAlias: string;
  storeName: string;
  onConfigDetected: (configJson: string) => void;
}) {
  const t = useTranslations("admin.stores");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectResponse | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState<ManualSample>(EMPTY_MANUAL);

  // Loja própria: marca/país são sempre sobrescritos pelo apelido/país da
  // PRÓPRIA loja (pipeline.py::_resolve_identity) — detectá-los na página
  // seria capturado à toa, então nem pede o exemplo desses dois campos.
  const isPropria = storeType === "propria";

  async function runDetect(samples?: Record<string, unknown>) {
    if (!siteUrl) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/detect-txt-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, url: siteUrl, storeType, brandAlias, storeName, samples }),
      });
      const data = (await res.json()) as DetectResponse;
      setResult(data);
      if (data.config) {
        onConfigDetected(JSON.stringify(data.config, null, 2));
        setShowManual(false);
      } else if (data.needsManualSample) {
        setShowManual(true);
      }
    } catch {
      setResult({
        config: null,
        preview: null,
        usedAutoSample: false,
        needsManualSample: true,
        missingRequired: [],
        warnings: [],
        error: t("txtDetectError"),
      });
      setShowManual(true);
    } finally {
      setLoading(false);
    }
  }

  function submitManual() {
    const preco = parsePriceLoose(manual.preco);
    if (!manual.nome.trim() || preco === null) return;
    runDetect({
      nome: manual.nome.trim(),
      preco,
      marca: isPropria ? undefined : manual.marca.trim() || undefined,
      pais: isPropria ? undefined : manual.pais.trim() || undefined,
      estilo: manual.estilo.trim() || undefined,
      urlProduto: manual.urlProduto.trim() || undefined,
      urlImagem: manual.urlImagem.trim() || undefined,
    });
  }

  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const labelCls = "text-xs text-neutral-500 dark:text-neutral-400";

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <h4 className="text-sm font-medium">{t("txtDetectTitle")}</h4>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("txtDetectHint")}</p>
      </div>

      <button
        type="button"
        onClick={() => runDetect(undefined)}
        disabled={loading || !siteUrl}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {loading ? t("txtDetecting") : t("txtDetectButton")}
      </button>

      {result?.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>
      )}

      {result?.config && result.preview && (
        <div className="space-y-2">
          <p className="text-xs text-green-700 dark:text-green-400">
            {result.usedAutoSample
              ? t("txtDetectAutoOk", { count: result.preview.count })
              : t("txtDetectManualOk", { count: result.preview.count })}
          </p>
          {result.preview.broken && (
            <p className="rounded bg-red-100 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {t("txtPreviewBroken")}
            </p>
          )}
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
              {w}
            </p>
          ))}
          {result.preview.rows.length > 0 && (
            <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-[11px]">
                <thead className="bg-neutral-100 text-left text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  <tr>
                    {(["NOM", "MARCA", "PAIS", "ESTILO", "PRC"] as const).map((col) => (
                      <th key={col} className="px-2 py-1 font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.rows.map((row, i) => (
                    <tr key={i} className="border-t border-neutral-200 dark:border-neutral-800">
                      {(["NOM", "MARCA", "PAIS", "ESTILO", "PRC"] as const).map((col) => (
                        <td key={col} className="max-w-[160px] truncate px-2 py-1">
                          {row[col] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showManual && (
        <div className="space-y-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{t("txtDetectNeedsManual")}</p>

          {result?.missingRequired.map((field) => (
            <p key={field} className="text-xs text-red-600 dark:text-red-400">
              {t("txtMissingRequired", { field: field === "nome" ? t("txtFieldNome") : t("txtFieldPreco") })}
            </p>
          ))}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelCls}>{t("txtFieldNome")}</span>
              <input
                value={manual.nome}
                onChange={(e) => setManual((m) => ({ ...m, nome: e.target.value }))}
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>{t("txtFieldPreco")}</span>
              <input
                value={manual.preco}
                onChange={(e) => setManual((m) => ({ ...m, preco: e.target.value }))}
                placeholder="24,90"
                className={inputCls}
              />
            </label>
            {!isPropria && (
              <label className="space-y-1">
                <span className={labelCls}>{t("txtFieldMarca")}</span>
                <input
                  value={manual.marca}
                  onChange={(e) => setManual((m) => ({ ...m, marca: e.target.value }))}
                  className={inputCls}
                />
              </label>
            )}
            {!isPropria && (
              <label className="space-y-1">
                <span className={labelCls}>{t("txtFieldPais")}</span>
                <input
                  value={manual.pais}
                  onChange={(e) => setManual((m) => ({ ...m, pais: e.target.value }))}
                  className={inputCls}
                />
              </label>
            )}
            <label className="space-y-1">
              <span className={labelCls}>{t("txtFieldEstilo")}</span>
              <input
                value={manual.estilo}
                onChange={(e) => setManual((m) => ({ ...m, estilo: e.target.value }))}
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>{t("txtFieldUrlProduto")}</span>
              <input
                value={manual.urlProduto}
                onChange={(e) => setManual((m) => ({ ...m, urlProduto: e.target.value }))}
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>{t("txtFieldUrlImagem")}</span>
              <input
                value={manual.urlImagem}
                onChange={(e) => setManual((m) => ({ ...m, urlImagem: e.target.value }))}
                className={inputCls}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={submitManual}
            disabled={loading || !manual.nome.trim() || parsePriceLoose(manual.preco) === null}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 dark:text-neutral-950"
          >
            {loading ? t("txtDetecting") : t("txtDetectWithSample")}
          </button>
        </div>
      )}
    </div>
  );
}
