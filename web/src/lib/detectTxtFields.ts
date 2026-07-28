// Detecta automaticamente o `config.fields` da plataforma "txt" (coletor
// posicional find/mid — ver scraper/platforms/txt.py) a partir de um produto
// de exemplo, em vez do admin escrever `{tag, ini, fim, tipo}` à mão lendo o
// HTML fonte. Ver web/src/app/api/admin/detect-txt-fields/route.ts (quem
// chama isto) e web/src/lib/parseTxtConfig.ts (pré-visualização do resultado).
//
// Regra que domina todo o desenho deste arquivo: o `fields` gerado aqui
// precisa continuar funcionando com `str.find` puro em Python — o coletor de
// verdade (txt.py) não tem cheerio nem DOM, só string bruta. Por isso cheerio
// entra AQUI só pra decidir O QUE procurar (qual elemento repete por
// produto, qual classe usar), nunca pra devolver texto reserializado — a
// reserialização do cheerio pode trocar aspas/espaçamento e não bater mais
// com o HTML de verdade que o Python vai buscar depois. Todo `ini`/`fim`
// devolvido é sempre um recorte literal do HTML BRUTO recebido.
import * as cheerio from "cheerio";
import { fold } from "./slug";
import { escapeRegex } from "./replacements";

export type TxtFieldTipo = "NOM" | "PRC" | "IMG" | "URL" | "MARCA" | "PAIS" | "ESTILO";

export type TxtField = { tag: string; ini: string; fim: string; tipo: TxtFieldTipo };

// Amostra digitada pelo admin (ou recuperada do último produto já coletado
// desta loja — ver detect-txt-fields/route.ts). nome/preco são obrigatórios
// porque são os únicos que scraper/platforms/txt.py exige pra montar um
// Candidate.
export type TxtSamples = {
  nome: string;
  preco: number;
  marca?: string;
  pais?: string;
  estilo?: string;
  urlProduto?: string;
  urlImagem?: string;
};

export type DetectTxtResult = {
  // null = faltou localizar um campo OBRIGATÓRIO (nome ou preço) na página.
  fields: TxtField[] | null;
  warnings: string[];
  missingRequired: ("nome" | "preco")[];
};

type CheerioRoot = ReturnType<typeof cheerio.load>;
type Span = { start: number; end: number };

// Cobre as entidades realmente comuns em e-commerce (moeda, acentuação
// pt-BR) mais referências numéricas — não é a tabela completa do HTML5 (isso
// exigiria uma dependência nova só pra este detalhe), mas é o bastante pra
// não desalinhar as posições que calculamos a seguir. `html.unescape` do
// Python, que o coletor de verdade aplica, é mais completo; entidades fora
// desta lista são raras nos sites reais deste catálogo e o pior caso é essa
// função não decodificar uma delas (fica como está, sem quebrar nada).
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  atilde: "ã", otilde: "õ", ccedil: "ç", ntilde: "ñ", acirc: "â", ecirc: "ê", ocirc: "ô",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  Atilde: "Ã", Otilde: "Õ", Ccedil: "Ç", Ntilde: "Ñ",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[entity] ?? whole;
  });
}

// ── Localização tolerante a caixa/acento ────────────────────────────
//
// O nome gravado no banco (usado como amostra quando ela vem do último
// produto já coletado, não digitada à mão) já passou por Title Case e
// separação de unidade (normalize.py) — quase nunca bate caractere a
// caractere com o texto cru do site (que costuma vir em CAIXA ALTA, ou com
// "500ml" colado). Por isso a localização usa uma versão "dobrada"
// (minúscula, sem acento) do HTML inteiro, preservando 1:1 a posição de cada
// caractere no HTML ORIGINAL — depois de casar na versão dobrada, volta pra
// posição real e os `ini`/`fim` computados dali em diante são sempre do
// texto original, nunca da versão dobrada.
type FoldedMap = { folded: string; map: number[] };

function foldChar(ch: string): string {
  return ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function buildFoldedMap(html: string): FoldedMap {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < html.length; i++) {
    for (const c of foldChar(html[i])) {
      folded += c;
      map.push(i);
    }
  }
  return { folded, map };
}

// Tolerância de caracteres não-alfanuméricos ENTRE palavras do mesmo valor
// (espaço extra, uma tag inline no meio do nome). Limitada — sem limite, o
// regex poderia "pular" pro produto seguinte quando duas palavras da amostra
// aparecem de novo bem mais adiante na página.
const MAX_GAP_BETWEEN_TOKENS = 40;

function tokenPattern(sample: string): RegExp | null {
  const tokens = fold(sample).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  const body = tokens.map(escapeRegex).join(`[^a-z0-9]{0,${MAX_GAP_BETWEEN_TOKENS}}`);
  return new RegExp(body);
}

// Devolve TODAS as ocorrências (não só a primeira) dentro do trecho dobrado
// [from, to) — quem chama escolhe qual faz mais sentido pro tipo de campo em
// vez de aceitar cegamente a primeira (que pode ser, por exemplo, o nome da
// marca reaparecendo dentro do nome do ARQUIVO da imagem, não no texto da
// marca de verdade).
function locateAllFuzzy(foldedMap: FoldedMap, sample: string, from: number, to: number): Span[] {
  const pattern = tokenPattern(sample);
  if (!pattern) return [];
  const global = new RegExp(pattern.source, "g");
  const slice = foldedMap.folded.slice(from, to);
  const spans: Span[] = [];
  let m: RegExpExecArray | null;
  while ((m = global.exec(slice))) {
    if (m[0].length === 0) {
      global.lastIndex++;
      continue;
    }
    const foldedStart = from + m.index;
    const foldedEnd = foldedStart + m[0].length - 1;
    spans.push({ start: foldedMap.map[foldedStart], end: foldedMap.map[foldedEnd] + 1 });
  }
  return spans;
}

// Tamanho aproximado de "um card de produto" no HTML bruto — os demais
// campos de UM MESMO produto são procurados primeiro dentro dessa janela ao
// redor do nome já localizado, pra não pegar o preço/imagem de OUTRO produto
// que por acaso repete o mesmo valor em outro lugar da página. Só cai pro
// documento inteiro se não achar nada por perto.
const CARD_WINDOW = 2000;

function rawToFoldedRange(foldedMap: FoldedMap, rawFrom: number, rawTo: number): [number, number] {
  const startIdx = foldedMap.map.findIndex((raw) => raw >= rawFrom);
  const from = startIdx === -1 ? foldedMap.folded.length : startIdx;
  let to = foldedMap.folded.length;
  for (let i = foldedMap.map.length - 1; i >= 0; i--) {
    if (foldedMap.map[i] < rawTo) {
      to = i + 1;
      break;
    }
  }
  return [from, Math.max(from, to)];
}

// Está dentro da região de atributos de uma tag (entre "<" e o ">" que a
// fecha), ou no texto de um elemento (depois do ">")? Checar só "vem logo
// depois de atributo="" não bastava: um valor no MEIO do conteúdo de um
// atributo (ex.: a marca reaparecendo dentro do nome do arquivo da imagem,
// "/img/erdinger.jpg") também precisa contar como "dentro de atributo", e só
// bate se o "<" mais próximo anterior ainda não foi fechado por um ">".
function isInsideAttribute(html: string, span: Span): boolean {
  const lastOpen = html.lastIndexOf("<", span.start - 1);
  const lastClose = html.lastIndexOf(">", span.start - 1);
  return lastOpen > lastClose;
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

// Entre as ocorrências candidatas, prefere a que combina com o tipo de campo
// — URL/imagem devem estar dentro de um atributo (href=/src=); os demais
// (marca, país, estilo) devem ser texto visível, não um pedaço de URL ou
// nome de arquivo que por coincidência contenha a mesma palavra. Descarta de
// cara qualquer candidato que esteja DENTRO do nome já localizado: a regra
// central do catálogo é "nome = marca + descritivo" ("Erdinger Weissbier
// 500ml"), então o texto da marca ("Erdinger") ou do estilo ("Weissbier")
// quase sempre aparece de novo, literalmente, dentro do próprio nome — sem
// essa exclusão, marca/estilo "detectados" seriam sempre o nome inteiro, não
// o campo dedicado da página. Entre os que sobram e combinam, prefere o mais
// próximo da âncora; se nenhum combinar, usa o mais próximo mesmo assim
// (degrada, não falha).
function pickBestSpan(
  html: string,
  candidates: Span[],
  anchor: Span | null,
  expectAttribute: boolean,
  exclude: Span | null = null,
): Span | null {
  const withoutExcluded = exclude ? candidates.filter((c) => !overlaps(c, exclude)) : candidates;
  if (withoutExcluded.length === 0) return null;
  const matching = withoutExcluded.filter((c) => isInsideAttribute(html, c) === expectAttribute);
  const pool = matching.length > 0 ? matching : withoutExcluded;
  if (!anchor) return pool[0];
  return [...pool].sort((a, b) => Math.abs(a.start - anchor.start) - Math.abs(b.start - anchor.start))[0];
}

function locateFuzzyNear(
  html: string,
  foldedMap: FoldedMap,
  sample: string,
  anchor: Span | null,
  expectAttribute: boolean,
  exclude: Span | null = null,
): Span | null {
  if (anchor) {
    const rawFrom = Math.max(0, anchor.start - CARD_WINDOW);
    const rawTo = Math.min(html.length, anchor.end + CARD_WINDOW);
    const [foldedFrom, foldedTo] = rawToFoldedRange(foldedMap, rawFrom, rawTo);
    const near = pickBestSpan(
      html,
      locateAllFuzzy(foldedMap, sample, foldedFrom, foldedTo),
      anchor,
      expectAttribute,
      exclude,
    );
    if (near) return near;
  }
  return pickBestSpan(
    html,
    locateAllFuzzy(foldedMap, sample, 0, foldedMap.folded.length),
    anchor,
    expectAttribute,
    exclude,
  );
}

// ── Preço: dígitos não precisam de dobra, mas têm formatos possíveis ──
function priceCandidates(price: number): string[] {
  const cents = Math.round(price * 100);
  const intPart = Math.floor(cents / 100);
  const centPart = String(((cents % 100) + 100) % 100).padStart(2, "0");
  return [`${intPart},${centPart}`, `${intPart}.${centPart}`, `${intPart}${centPart}`];
}

function locatePrice(html: string, price: number, from = 0, to = html.length): Span | null {
  const window = html.slice(from, to);
  for (const candidate of priceCandidates(price)) {
    const idx = window.indexOf(candidate);
    if (idx !== -1) return { start: from + idx, end: from + idx + candidate.length };
  }
  return null;
}

function locatePriceNear(html: string, price: number, anchor: Span | null): Span | null {
  if (anchor) {
    const from = Math.max(0, anchor.start - CARD_WINDOW);
    const to = Math.min(html.length, anchor.end + CARD_WINDOW);
    const near = locatePrice(html, price, from, to);
    if (near) return near;
  }
  return locatePrice(html, price);
}

// ── URL/imagem: tenta casamento EXATO antes do difuso ───────────────
//
// Uma URL normalmente vem copiada literalmente da própria página (não passou
// por Title Case nem reformatação, ao contrário do nome). Mas ela quase
// sempre começa com "/" ou "http(s)://", que `fold()` descarta como
// pontuação — buscar por TOKENS faria o trecho localizado começar alguns
// caracteres DEPOIS do início real do atributo, e `deriveDelimiters` deixaria
// de reconhecer o padrão limpo `href="`/`src="` (caía num fallback cru que
// podia vazar pro atributo VIZINHO, ex. capturar pedaço do `alt="..."`
// seguinte). Buscar o valor exato primeiro evita isso na maioria dos casos
// reais; só cai pro difuso se a URL realmente não bater (ex. o exemplo
// gravado é absoluto e o site usa caminho relativo).
function locateExact(html: string, sample: string, from: number, to: number): Span | null {
  const window = html.slice(from, to);
  const idx = window.indexOf(sample);
  if (idx !== -1) return { start: from + idx, end: from + idx + sample.length };
  const lowerIdx = window.toLowerCase().indexOf(sample.toLowerCase());
  if (lowerIdx !== -1) return { start: from + lowerIdx, end: from + lowerIdx + sample.length };
  return null;
}

function urlCandidates(sample: string): string[] {
  const candidates = [sample];
  try {
    const u = new URL(sample);
    const relative = u.pathname + u.search + u.hash;
    if (relative && relative !== "/") candidates.push(relative);
  } catch {
    // já não é uma URL absoluta — nada a acrescentar.
  }
  return candidates;
}

function locateUrlNear(html: string, sample: string, anchor: Span | null): Span | null {
  const from = anchor ? Math.max(0, anchor.start - CARD_WINDOW) : 0;
  const to = anchor ? Math.min(html.length, anchor.end + CARD_WINDOW) : html.length;
  for (const candidate of urlCandidates(sample)) {
    const near = locateExact(html, candidate, from, to);
    if (near) return near;
  }
  for (const candidate of urlCandidates(sample)) {
    const anywhere = locateExact(html, candidate, 0, html.length);
    if (anywhere) return anywhere;
  }
  return null;
}

// ── Delimitadores (ini/fim) a partir de um trecho já localizado ────
//
// Nunca deixa o delimitador conter texto ESPECÍFICO desta amostra (dígito do
// preço, palavra do nome) — só marcação estrutural (tag, atributo, aspas),
// que é o que repete de produto pra produto. Duas formas reconhecidas, na
// ordem em que HTML real costuma aparecer:
//   1. valor dentro de atributo (href="...", data-preco="...");
//   2. valor como texto de elemento, entre a tag de abertura mais próxima e
//      o "<" seguinte (ou a tag de fechamento correspondente, quando existe
//      perto o bastante pra ser um limite mais específico).
function deriveDelimiters(html: string, span: Span): { ini: string; fim: string } {
  const before = html.slice(Math.max(0, span.start - 80), span.start);
  const after = html.slice(span.end, Math.min(html.length, span.end + 80));

  const attrMatch = before.match(/([\w:-]+)=(["'])$/);
  if (attrMatch) {
    const [, attrName, quote] = attrMatch;
    return { ini: `${attrName}=${quote}`, fim: quote };
  }

  const openTagMatch = before.match(/<([a-zA-Z][\w-]*)\b[^<>]*>$/);
  if (openTagMatch) {
    const closeTag = `</${openTagMatch[1]}>`;
    return { ini: openTagMatch[0], fim: after.includes(closeTag) ? closeTag : "<" };
  }

  // Fallback: janela crua curta, sem dígitos colados na ponta (evita
  // capturar o próprio valor quando ele é numérico).
  return {
    ini: before.slice(-12).replace(/^[0-9.,]*/, ""),
    fim: after.slice(0, 12).replace(/[0-9.,]*$/, "") || after.slice(0, 1),
  };
}

// ── Âncora do campo 0 (nome): o que o coletor usa pra achar "o próximo
// produto" e continuar o loop pela página inteira (scraper/platforms/
// txt.py::collect). Usa cheerio só pra achar QUAL ancestral se repete —
// mirando a mesma ideia de guessListingPattern em detectPlatform.ts (classe
// do ancestral mais repetida), mas aqui a partir do elemento que contém o
// NOME de amostra em vez de um link de listagem.
const MIN_ANCHOR_REPEATS = 2;
const MAX_ANCESTOR_DEPTH = 4;

function pickAnchorTag(html: string, $: CheerioRoot, sampleName: string): string | null {
  // Mesma tolerância a espaçamento que `locateFuzzy` usa no HTML bruto —
  // sem ela, um nome gravado como "Erdinger Weissbier 500 ml" (Title Case,
  // unidade separada) não bate com o texto cru do elemento
  // ("ERDINGER WEISSBIER500ML", sem espaço no volume).
  const pattern = tokenPattern(sampleName);
  if (!pattern) return null;

  // Entre os elementos cujo texto (com filhos) contém a amostra, o "mais
  // apertado" (menor texto total) é o candidato a nó-folha real do produto —
  // sem isso, ancestrais gigantes (a listagem inteira) também "contêm" o
  // nome e atrapalhariam a escolha.
  let leaf: ReturnType<typeof $> | null = null;
  let leafLen = Infinity;
  $("*").each((_, el) => {
    const text = fold($(el).text());
    if (!pattern.test(text)) return;
    if (text.length < leafLen) {
      leaf = $(el);
      leafLen = text.length;
    }
  });
  if (!leaf) return null;

  let current: ReturnType<typeof $> = leaf;
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
    current = current.parent();
    if (current.length === 0) break;
    const cls = current.attr("class")?.trim().split(/\s+/)[0];
    if (!cls) continue;
    for (const quote of ['"', "'"] as const) {
      const candidate = `class=${quote}${cls}`;
      if (html.split(candidate).length - 1 >= MIN_ANCHOR_REPEATS) return candidate;
    }
  }
  return null;
}

type LocatedField = { tipo: TxtFieldTipo; span: Span };

// ── Ponto de entrada ─────────────────────────────────────────────────
export function detectTxtFields(rawHtml: string, samples: TxtSamples): DetectTxtResult {
  const html = decodeHtmlEntities(rawHtml);
  const $ = cheerio.load(html);
  const foldedMap = buildFoldedMap(html);
  const warnings: string[] = [];
  const missingRequired: ("nome" | "preco")[] = [];

  // expectAttribute=false: o nome é sempre texto visível, nunca o valor de
  // um atributo — evita casar, por exemplo, dentro do href/src de outro
  // produto que por coincidência contenha a mesma palavra.
  const nomeSpan = pickBestSpan(
    html,
    locateAllFuzzy(foldedMap, samples.nome, 0, foldedMap.folded.length),
    null,
    false,
  );
  if (!nomeSpan) missingRequired.push("nome");

  const precoSpan = locatePriceNear(html, samples.preco, nomeSpan);
  if (!precoSpan) missingRequired.push("preco");

  if (missingRequired.length > 0 || !nomeSpan || !precoSpan) {
    return { fields: null, warnings, missingRequired };
  }

  const located: LocatedField[] = [
    { tipo: "NOM", span: nomeSpan },
    { tipo: "PRC", span: precoSpan },
  ];

  // expectAttribute: URL/imagem normalmente vivem dentro de href=/src=;
  // marca/país/estilo são texto visível — sem essa distinção, "Erdinger"
  // como amostra de marca podia casar dentro de `src="/img/erdinger.jpg"`
  // (o nome do ARQUIVO da imagem) em vez do texto da marca de verdade.
  const optional: { key: keyof TxtSamples; tipo: TxtFieldTipo; label: string; expectAttribute: boolean }[] = [
    { key: "marca", tipo: "MARCA", label: "marca", expectAttribute: false },
    { key: "pais", tipo: "PAIS", label: "país", expectAttribute: false },
    { key: "estilo", tipo: "ESTILO", label: "estilo", expectAttribute: false },
    { key: "urlProduto", tipo: "URL", label: "URL do produto", expectAttribute: true },
    { key: "urlImagem", tipo: "IMG", label: "URL da imagem", expectAttribute: true },
  ];
  for (const { key, tipo, label, expectAttribute } of optional) {
    const value = samples[key];
    if (!value) continue; // amostra não informada — campo opcional fica de fora, sem aviso
    // URL/imagem: tenta o valor exato primeiro (ver locateUrlNear); só cai
    // pro difuso (tolerante a caixa/espaço) se isso falhar.
    const span =
      tipo === "URL" || tipo === "IMG"
        ? (locateUrlNear(html, String(value), nomeSpan) ??
          locateFuzzyNear(html, foldedMap, String(value), nomeSpan, expectAttribute, nomeSpan))
        : locateFuzzyNear(html, foldedMap, String(value), nomeSpan, expectAttribute, nomeSpan);
    if (!span) {
      warnings.push(`Não encontrei o exemplo de ${label} ("${value}") na página — esse campo vai ficar vazio na coleta.`);
      continue;
    }
    located.push({ tipo, span });
  }

  // A ORDEM no config precisa ser a mesma ordem em que os campos aparecem no
  // HTML de verdade — o parser (scraper/platforms/txt.py) só anda pra
  // FRENTE: a busca de cada campo começa onde o campo anterior terminou.
  // Listar "nome, preço, marca..." (ordem lógica) quando o card real exibe
  // "imagem, nome, marca, país, estilo, preço, link" faria o parser, ao
  // processar o preço, já ter avançado além de marca/país/estilo — e
  // encontraria esses campos no produto SEGUINTE por engano (bug real, pego
  // testando contra HTML sintético antes de existir loja real usando isto).
  // Ordenar por posição resolve de vez.
  located.sort((a, b) => a.span.start - b.span.start);

  const anchorTag = pickAnchorTag(html, $, samples.nome);
  if (!anchorTag) {
    warnings.push(
      "Não encontrei um bloco que se repete claramente a cada produto — a coleta desta loja pode ficar mais sensível a mudanças no site.",
    );
  }

  // Só o PRIMEIRO campo (já reordenado) atua como âncora do loop externo —
  // precisa ser um marcador que se repita 1x por produto (o container),
  // nunca o delimitador específico de um campo só, que não necessariamente
  // repete sozinho fora do contexto dos outros campos.
  const fields: TxtField[] = located.map(({ tipo, span }, i) => {
    const d = deriveDelimiters(html, span);
    return { tag: i === 0 ? anchorTag ?? d.ini : d.ini, ini: d.ini, fim: d.fim, tipo };
  });

  return { fields, warnings, missingRequired: [] };
}
