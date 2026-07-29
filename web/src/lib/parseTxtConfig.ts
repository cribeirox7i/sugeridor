// Porta em TS do parser da plataforma "txt" (scraper/platforms/txt.py::collect)
// — usada SÓ pra pré-visualização no momento da detecção (ver
// web/src/app/api/admin/detect-txt-fields/route.ts), nunca na coleta de
// verdade (que continua rodando o Python original). Precisa espelhar o
// algoritmo Python EXATAMENTE, incluindo os dois ajustes já feitos lá:
//   1. cada campo busca a partir de onde o campo ANTERIOR terminou
//      (search_from), não do início do produto;
//   2. `fim` é buscado a partir do FINAL de `ini`, não do início dele —
//      buscar a partir do início quebra sempre que `ini` termina com o
//      mesmo caractere que `fim` (ex.: `src="` e `"`), porque o `find`
//      acha a própria aspa de dentro de `ini` e o valor sai vazio.
// Qualquer divergência entre este arquivo e txt.py faz a pré-visualização
// mentir sobre o que a coleta de verdade vai extrair — mesmo risco de
// "parity drift" já visto entre normalize.py/slug.ts, mitigado lá por um
// script de comparação manual (ver web/tmp-parity.ts no histórico do
// projeto); o mesmo cuidado vale aqui.
import { decodeHtmlEntities } from "./detectTxtFields";
import type { TxtField, TxtFieldTipo } from "./detectTxtFields";

export type TxtRow = Partial<Record<TxtFieldTipo, string>>;

// Porta de scraper/price.py::parse_price — mesma heurística de separador
// decimal (o último de '.'/',' que aparece, ou o único presente se tiver
// poucos dígitos depois dele). Usada só pra VALIDAR o preço extraído na
// pré-visualização, nunca pra gravar nada.
export function parsePriceLoose(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/[^0-9.,]/g, "");
  if (!s) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let decSep: "." | "," | null = null;

  if (hasDot && hasComma) {
    decSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const digitsAfterLast = s.length - s.lastIndexOf(sep) - 1;
    decSep = digitsAfterLast <= 2 ? sep : null;
  }

  if (!decSep) {
    const digits = s.replace(/[.,]/g, "");
    return digits ? Number(digits) : null;
  }

  const decPos = s.lastIndexOf(decSep);
  const intPart = s.slice(0, decPos).replace(/[.,]/g, "") || "0";
  const fracPart = s.slice(decPos + 1).replace(/[.,]/g, "");
  const n = Number(fracPart ? `${intPart}.${fracPart}` : intPart);
  return Number.isFinite(n) ? n : null;
}

// Mesmo algoritmo de txt.py::collect, sem os passos de gravação (product
// type, brand resolution etc. — isso é o pipeline, não o coletor). Devolve
// linhas BRUTAS (string por tipo), pra validação decidir o que é aceitável.
export function parseTxtConfig(rawHtml: string, fields: TxtField[], maxItems = 500): TxtRow[] {
  const html = decodeHtmlEntities(rawHtml);
  const rows: TxtRow[] = [];
  let pos = 0;

  while (pos < html.length && rows.length < maxItems) {
    const values: TxtRow = {};
    let anchorPos: number | null = null;
    let lastFim = -1;
    let searchFrom = pos;

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const posTag = html.indexOf(f.tag, searchFrom);
      if (i === 0) {
        if (posTag === -1) return rows; // sem mais âncoras: fim da coleta
        anchorPos = posTag;
      }

      const posIni = posTag !== -1 ? html.indexOf(f.ini, posTag) : -1;
      const posFim = posIni !== -1 ? html.indexOf(f.fim, posIni + f.ini.length) : -1;

      if (posIni === -1 || posFim === -1) {
        if (i === 0) return rows; // campo âncora não encontrado: fim
        values[f.tipo] = "";
        continue;
      }

      values[f.tipo] = html.slice(posIni + f.ini.length, posFim).trim();
      lastFim = posFim;
      searchFrom = posFim;
    }

    rows.push(values);
    pos = lastFim !== -1 ? lastFim : (anchorPos ?? 0) + 1;
  }

  return rows;
}

export type TxtPreview = {
  rows: TxtRow[];
  count: number;
  // true = achado algo estruturalmente quebrado demais pra confiar (ver
  // regra abaixo) — a tela deve travar o preenchimento automático do config
  // até o admin revisar, não só avisar.
  broken: boolean;
  warnings: string[];
};

// Confere se o `fields` detectado realmente extrai algo utilizável, ANTES de
// preencher o config sozinho — mesmo espírito do "Afeta N produtos" que as
// outras telas do admin mostram antes de aplicar uma ação em lote (ver
// web/src/app/[locale]/admin/(painel)/ferramentas/page.tsx).
//
// Só um caso trava de verdade (broken=true): todo preço extraído é IGUAL ao
// da amostra. Isso é o sintoma de um delimitador de preço que grudou no
// DÍGITO específico da amostra em vez de um marcador genérico — nesse caso o
// preço ficaria travado no mesmo valor pra sempre, silenciosamente, o que é
// pior que simplesmente falhar (constraint `price > 0` do banco não pega
// isso, porque o valor É positivo, só está sempre errado). Os demais
// problemas (poucos produtos, nome vazio) viram aviso, não bloqueio — o
// catálogo é pequeno o bastante, e a decisão de usar mesmo assim é do admin.
// `samplePrice` é null no modo manual (o admin digitou os delimitadores, não um
// produto de exemplo): sem preço de referência, a checagem de "preço travado no
// valor da amostra" não se aplica e é pulada — as demais valem igual.
export function evaluateTxtPreview(
  rows: TxtRow[],
  samplePrice: number | null,
  previewLimit = 5,
): TxtPreview {
  const warnings: string[] = [];

  if (rows.length < 2) {
    warnings.push(
      `Só ${rows.length} produto(s) reconhecido(s) nesta página — confira se o bloco que se repete por produto foi identificado direito.`,
    );
  }

  const withoutName = rows.filter((r) => !r.NOM?.trim()).length;
  if (withoutName > 0) {
    warnings.push(`${withoutName} produto(s) ficaram sem nome.`);
  }

  const prices = rows.map((r) => parsePriceLoose(r.PRC)).filter((p): p is number => p !== null);
  const invalidPrices = rows.length - prices.length;
  if (invalidPrices > 0) {
    warnings.push(`${invalidPrices} produto(s) ficaram com preço não reconhecido.`);
  }

  const distinctPrices = new Set(prices.map((p) => p.toFixed(2)));
  const broken =
    samplePrice !== null &&
    rows.length >= 2 &&
    prices.length === rows.length &&
    distinctPrices.size === 1 &&
    distinctPrices.has(samplePrice.toFixed(2));
  if (broken) {
    warnings.push(
      "Todos os produtos ficaram com o MESMO preço do exemplo — o delimitador de preço provavelmente grudou no valor específico do produto de exemplo, em vez de um marcador que se repete. Ajuste o exemplo ou os campos antes de salvar.",
    );
  }

  return { rows: rows.slice(0, previewLimit), count: rows.length, broken, warnings };
}
