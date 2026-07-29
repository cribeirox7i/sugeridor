"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { parsePriceLoose } from "@/lib/parseTxtConfig";
import type { TxtField, TxtFieldTipo } from "@/lib/detectTxtFields";

type PreviewRow = Partial<Record<TxtFieldTipo, string>>;

type DetectResponse = {
  config: { fields: TxtField[]; max_items: number } | null;
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

const EMPTY_SAMPLE: ManualSample = {
  nome: "",
  preco: "",
  marca: "",
  pais: "",
  estilo: "",
  urlProduto: "",
  urlImagem: "",
};

// Linha do modo manual: os três delimitadores que o coletor usa por campo.
type TagRow = { tipo: TxtFieldTipo; tag: string; ini: string; fim: string };

// Ordem inicial pensada na ordem em que um card de produto costuma aparecer no
// HTML — imagem e link no topo, preço perto do fim. A ordem IMPORTA (ver o
// aviso na tela), então o usuário pode reordenar.
const DEFAULT_ROWS: TagRow[] = [
  { tipo: "IMG", tag: "", ini: "", fim: "" },
  { tipo: "URL", tag: "", ini: "", fim: "" },
  { tipo: "NOM", tag: "", ini: "", fim: "" },
  { tipo: "MARCA", tag: "", ini: "", fim: "" },
  { tipo: "PAIS", tag: "", ini: "", fim: "" },
  { tipo: "ESTILO", tag: "", ini: "", fim: "" },
  { tipo: "PRC", tag: "", ini: "", fim: "" },
];

// Reconstrói as linhas a partir de um config já salvo, preservando a ordem
// gravada e acrescentando no fim os tipos que ainda não foram configurados.
function rowsFromConfig(configJson: string): TagRow[] {
  try {
    const parsed = JSON.parse(configJson) as { fields?: TxtField[] };
    const fields = parsed.fields;
    if (!Array.isArray(fields) || fields.length === 0) return DEFAULT_ROWS;
    const usados = new Set(fields.map((f) => f.tipo));
    return [
      ...fields.map((f) => ({ tipo: f.tipo, tag: f.tag ?? "", ini: f.ini ?? "", fim: f.fim ?? "" })),
      ...DEFAULT_ROWS.filter((r) => !usados.has(r.tipo)),
    ];
  } catch {
    return DEFAULT_ROWS;
  }
}

// Painel de configuração da plataforma "txt" (coletor posicional find/mid — ver
// scraper/platforms/txt.py). Dois caminhos, escolhidos pelo admin:
//
//  * AUTOMÁTICO: informa um produto de exemplo (ou deixa o sistema pegar o
//    último já coletado da loja) e a detecção deriva os delimitadores.
//  * MANUAL: o admin digita `tag`/`ini`/`fim` de cada campo. Existe porque a
//    detecção automática por texto não acerta em todo site, e sem esta saída a
//    única alternativa era escrever o JSON de config à mão.
//
// Nos dois casos há um teste contra a página real antes de salvar: é a única
// forma de saber que os delimitadores funcionam — em especial no manual, onde
// errar a ORDEM dos campos é silencioso (o parser só anda pra frente).
export default function TxtFieldDetector({
  storeId,
  siteUrl,
  storeType,
  brandAlias,
  storeName,
  currentConfig,
  onConfigDetected,
}: {
  storeId?: string;
  siteUrl: string;
  storeType: string;
  brandAlias: string;
  storeName: string;
  currentConfig: string;
  onConfigDetected: (configJson: string) => void;
}) {
  const t = useTranslations("admin.stores");
  const [modo, setModo] = useState<"auto" | "manual">("auto");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectResponse | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [sample, setSample] = useState<ManualSample>(EMPTY_SAMPLE);
  const [rows, setRows] = useState<TagRow[]>(() => rowsFromConfig(currentConfig));

  // Loja própria: marca/país são sempre sobrescritos pelo apelido/país da
  // PRÓPRIA loja (pipeline.py), então configurá-los aqui não teria efeito.
  const isPropria = storeType === "propria";
  const visibleRows = rows.filter((r) => !(isPropria && (r.tipo === "MARCA" || r.tipo === "PAIS")));

  async function call(body: Record<string, unknown>) {
    if (!siteUrl) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/detect-txt-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, url: siteUrl, storeType, brandAlias, storeName, ...body }),
      });
      const data = (await res.json()) as DetectResponse;
      setResult(data);
      if (data.config) {
        onConfigDetected(JSON.stringify(data.config, null, 2));
        if (body.samples || body.fields) setShowSample(false);
      } else if (data.needsManualSample) {
        setShowSample(true);
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
    } finally {
      setLoading(false);
    }
  }

  function submitSample() {
    const preco = parsePriceLoose(sample.preco);
    if (!sample.nome.trim() || preco === null) return;
    call({
      samples: {
        nome: sample.nome.trim(),
        preco,
        marca: isPropria ? undefined : sample.marca.trim() || undefined,
        pais: isPropria ? undefined : sample.pais.trim() || undefined,
        estilo: sample.estilo.trim() || undefined,
        urlProduto: sample.urlProduto.trim() || undefined,
        urlImagem: sample.urlImagem.trim() || undefined,
      },
    });
  }

  // Uma linha vale quando tem INÍCIO e FIM. A tag é opcional: em branco, usa o
  // próprio início — que é o que a detecção automática também faz nos campos
  // que não são a âncora. Linha pela metade fica fora, senão o coletor
  // procuraria por string vazia, que casa em qualquer posição.
  function preenchidas(): TagRow[] {
    return visibleRows.filter((r) => r.ini.trim() && r.fim.trim());
  }

  const completas = preenchidas();
  const temObrigatorios =
    completas.some((r) => r.tipo === "NOM") && completas.some((r) => r.tipo === "PRC");

  // A armadilha do parser: ele procura o INÍCIO a partir da posição da TAG. Se
  // a tag estiver no MEIO do início (natural digitar tag=`class="nome"` e
  // início=`<h3 class="nome">`), a busca começa depois dela e acha a ocorrência
  // do PRÓXIMO produto — os campos saem embaralhados entre produtos, sem erro
  // nenhum. Aqui isso é avisado antes de o usuário perder tempo testando.
  const tagsSuspeitas = completas.filter(
    (r) => r.tag.trim() && r.ini.includes(r.tag.trim()) && !r.ini.startsWith(r.tag.trim()),
  );

  function testarManual() {
    if (!temObrigatorios) return;
    call({
      fields: completas.map(({ tipo, tag, ini, fim }) => ({
        tipo,
        tag: tag.trim() || ini,
        ini,
        fim,
      })),
    });
  }

  function mover(tipo: TxtFieldTipo, delta: number) {
    setRows((atual) => {
      const i = atual.findIndex((r) => r.tipo === tipo);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function editar(tipo: TxtFieldTipo, campo: "tag" | "ini" | "fim", valor: string) {
    setRows((atual) => atual.map((r) => (r.tipo === tipo ? { ...r, [campo]: valor } : r)));
  }

  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const sampleInputCls =
    "w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const labelCls = "text-xs text-neutral-500 dark:text-neutral-400";
  const tabCls = (ativo: boolean) =>
    `rounded px-3 py-1.5 text-sm ${
      ativo
        ? "bg-amber-600 font-medium text-white dark:text-neutral-950"
        : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    }`;

  const TIPO_LABEL: Record<TxtFieldTipo, string> = {
    NOM: t("txtFieldNome"),
    PRC: t("txtFieldPreco"),
    MARCA: t("txtFieldMarca"),
    PAIS: t("txtFieldPais"),
    ESTILO: t("txtFieldEstilo"),
    URL: t("txtFieldUrlProduto"),
    IMG: t("txtFieldUrlImagem"),
  };

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <h4 className="text-sm font-medium">{t("txtDetectTitle")}</h4>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("txtDetectHint")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setModo("auto")} className={tabCls(modo === "auto")}>
          {t("txtModeAuto")}
        </button>
        <button type="button" onClick={() => setModo("manual")} className={tabCls(modo === "manual")}>
          {t("txtModeManual")}
        </button>
      </div>

      {/* ── Modo automático ── */}
      {modo === "auto" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => call({})}
            disabled={loading || !siteUrl}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {loading ? t("txtDetecting") : t("txtDetectButton")}
          </button>

          {showSample && (
            <div className="space-y-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                {t("txtDetectNeedsManual")}
              </p>
              {result?.missingRequired.map((field) => (
                <p key={field} className="text-xs text-red-600 dark:text-red-400">
                  {t("txtMissingRequired", {
                    field: field === "nome" ? t("txtFieldNome") : t("txtFieldPreco"),
                  })}
                </p>
              ))}
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["nome", t("txtFieldNome")],
                    ["preco", t("txtFieldPreco")],
                    ...(isPropria
                      ? []
                      : ([
                          ["marca", t("txtFieldMarca")],
                          ["pais", t("txtFieldPais")],
                        ] as [keyof ManualSample, string][])),
                    ["estilo", t("txtFieldEstilo")],
                    ["urlProduto", t("txtFieldUrlProduto")],
                    ["urlImagem", t("txtFieldUrlImagem")],
                  ] as [keyof ManualSample, string][]
                ).map(([key, label]) => (
                  <label key={key} className="space-y-1">
                    <span className={labelCls}>{label}</span>
                    <input
                      value={sample[key]}
                      onChange={(e) => setSample((m) => ({ ...m, [key]: e.target.value }))}
                      placeholder={key === "preco" ? "24,90" : undefined}
                      className={sampleInputCls}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={submitSample}
                disabled={loading || !sample.nome.trim() || parsePriceLoose(sample.preco) === null}
                className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 dark:text-neutral-950"
              >
                {loading ? t("txtDetecting") : t("txtDetectWithSample")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Modo manual ── */}
      {modo === "manual" && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{t("txtManualHint")}</p>
          <p className="rounded bg-amber-100 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {t("txtManualOrderWarning")}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="text-left text-neutral-500 dark:text-neutral-400">
                <tr>
                  <th className="pb-1 pr-2 font-medium">{t("txtColOrder")}</th>
                  <th className="pb-1 pr-2 font-medium">{t("txtColField")}</th>
                  <th className="pb-1 pr-2 font-medium">{t("txtColIni")}</th>
                  <th className="pb-1 pr-2 font-medium">{t("txtColFim")}</th>
                  <th className="pb-1 font-medium">{t("txtColTag")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr key={row.tipo}>
                    <td className="py-0.5 pr-2 align-middle">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => mover(row.tipo, -1)}
                          disabled={i === 0}
                          aria-label={t("txtMoveUp")}
                          className="rounded border border-neutral-300 px-1 text-neutral-500 disabled:opacity-30 dark:border-neutral-700"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(row.tipo, 1)}
                          disabled={i === visibleRows.length - 1}
                          aria-label={t("txtMoveDown")}
                          className="rounded border border-neutral-300 px-1 text-neutral-500 disabled:opacity-30 dark:border-neutral-700"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-0.5 pr-2 align-middle">
                      {TIPO_LABEL[row.tipo]}
                      {i === 0 && (
                        <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-500">
                          {t("txtAnchorBadge")}
                        </span>
                      )}
                    </td>
                    {/* Início e Fim primeiro (são o que sempre se preenche);
                        a Tag vem por último porque só a âncora precisa dela. */}
                    {(["ini", "fim", "tag"] as const).map((campo) => (
                      <td key={campo} className="py-0.5 pr-2 align-middle">
                        <input
                          value={row[campo]}
                          onChange={(e) => editar(row.tipo, campo, e.target.value)}
                          placeholder={campo === "tag" && i > 0 ? t("txtTagOptional") : undefined}
                          className={inputCls}
                          spellCheck={false}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {tagsSuspeitas.length > 0 && (
            <p className="rounded bg-red-100 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {t("txtTagInsideIni", {
                fields: tagsSuspeitas.map((r) => TIPO_LABEL[r.tipo]).join(", "),
              })}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={testarManual}
              disabled={loading || !temObrigatorios || !siteUrl}
              title={!temObrigatorios ? t("txtManualNeedsRequired") : undefined}
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 dark:text-neutral-950"
            >
              {loading ? t("txtTesting") : t("txtTestButton")}
            </button>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("txtManualFilled", { count: completas.length })}
            </span>
          </div>
        </div>
      )}

      {/* ── Resultado, comum aos dois modos ── */}
      {result?.error && <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>}

      {result?.config && result.preview && (
        <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
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
    </div>
  );
}
