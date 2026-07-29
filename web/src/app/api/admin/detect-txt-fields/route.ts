// Detecta o config.fields da plataforma "txt" a partir de um exemplo — ver
// web/src/lib/detectTxtFields.ts pro algoritmo. Duas camadas, na ordem que o
// usuário desenhou:
//
//  1. Automática: sem `samples` no corpo, busca a oferta ATIVA mais recente
//     da loja no banco e usa o produto/preço/URL/imagem já coletados como
//     exemplo — o admin não digita nada. Corrige o caso de loja própria (o
//     nome gravado tem a marca prefixada pelo pipeline; o texto cru do site
//     não tem esse prefixo) tentando os dois nomes, com e sem o prefixo.
//  2. Manual: `samples` explícito no corpo — usado quando não há produto
//     anterior da loja, ou quando a tentativa automática falhou (campo
//     obrigatório não encontrado, ou pré-visualização com sinal de
//     delimitador quebrado — ver evaluateTxtPreview).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectTxtFields, type TxtField, type TxtSamples } from "@/lib/detectTxtFields";
import { parseTxtConfig, evaluateTxtPreview, type TxtPreview } from "@/lib/parseTxtConfig";

const UA = "SugeridorBot/1.0 (+https://sugeridor.vercel.app; detector de campos txt)";

async function fetchListingHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type RequestBody = {
  storeId?: string;
  url?: string;
  storeType?: string;
  brandAlias?: string;
  storeName?: string;
  samples?: Partial<TxtSamples>;
  // Modo MANUAL: o admin digitou os delimitadores em vez de dar um produto de
  // exemplo. Aqui não há nada a detectar — só rodar o parser contra a página e
  // devolver a prévia, que é a única forma de ele saber se acertou (em especial
  // a ORDEM dos campos, que o parser exige que seja a do HTML).
  fields?: TxtField[];
};

type OfferForSample = {
  price: number;
  url: string;
  product: {
    name: string;
    brand: string | null;
    image_url: string | null;
    attributes: Record<string, string | number> | null;
  } | null;
};

// Reconstrói uma amostra a partir do último produto já coletado desta loja —
// pulando marca/país quando a loja é 'própria' (nesse caso pipeline.py
// sempre sobrescreve os dois pelo apelido/país da própria loja, então
// detectá-los na página seria capturado à toa).
function sampleFromOffer(
  offer: OfferForSample,
  storeType: string,
  effectiveBrand: string,
): TxtSamples[] {
  const product = offer.product;
  if (!product) return [];

  const isPropria = storeType === "propria";
  const attrs = product.attributes ?? {};
  const base: TxtSamples = {
    nome: product.name,
    preco: offer.price,
    urlProduto: offer.url || undefined,
    urlImagem: product.image_url || undefined,
    estilo: typeof attrs.estilo === "string" ? attrs.estilo : undefined,
    ...(isPropria
      ? {}
      : {
          marca: product.brand || undefined,
          pais: typeof attrs.pais === "string" ? attrs.pais : undefined,
        }),
  };

  // Loja própria: o nome gravado já veio com a marca prefixada
  // (scraper/pipeline.py::_resolve_identity -> prefix_brand), mas o texto
  // CRU do site não tem esse prefixo — tenta os dois, nome como está E sem
  // o prefixo, nessa ordem (o primeiro que a detecção conseguir usar vale).
  if (isPropria) {
    const prefix = `${effectiveBrand} `;
    if (base.nome.toLowerCase().startsWith(prefix.toLowerCase()) && base.nome.length > prefix.length) {
      return [base, { ...base, nome: base.nome.slice(prefix.length) }];
    }
  }
  return [base];
}

async function deriveSamplesFromDb(
  storeId: string,
  storeType: string,
  effectiveBrand: string,
): Promise<TxtSamples[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("offers")
    .select("price, url, product:products(name, brand, image_url, attributes)")
    .eq("store_id", storeId)
    .eq("active", true)
    .order("last_seen_at", { ascending: false })
    .limit(1);

  const offer = (data ?? [])[0] as unknown as OfferForSample | undefined;
  if (!offer) return [];
  return sampleFromOffer(offer, storeType, effectiveBrand);
}

type DetectResponse = {
  config: { fields: unknown[]; max_items: number } | null;
  preview: TxtPreview | null;
  usedAutoSample: boolean;
  sampleUsed: TxtSamples | null;
  needsManualSample: boolean;
  missingRequired: ("nome" | "preco")[];
  warnings: string[];
  error?: string;
};

function tryDetect(html: string, samples: TxtSamples) {
  const detected = detectTxtFields(html, samples);
  if (!detected.fields) return { detected, preview: null };
  const rows = parseTxtConfig(html, detected.fields);
  const preview = evaluateTxtPreview(rows, samples.preco);
  return { detected, preview };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const { url, storeId, storeType = "marketplace", brandAlias, storeName } = body;
  if (!url) return NextResponse.json({ error: "URL obrigatória" }, { status: 400 });

  const html = await fetchListingHtml(url);
  if (!html) {
    return NextResponse.json<DetectResponse>({
      config: null,
      preview: null,
      usedAutoSample: false,
      sampleUsed: null,
      needsManualSample: true,
      missingRequired: [],
      warnings: [],
      error: "Não consegui acessar essa URL pra analisar.",
    });
  }

  // ── Modo manual: só testar os delimitadores digitados ──
  if (body.fields && body.fields.length > 0) {
    const rows = parseTxtConfig(html, body.fields);
    const preview = evaluateTxtPreview(rows, null);
    return NextResponse.json<DetectResponse>({
      config: { fields: body.fields, max_items: 200 },
      preview,
      usedAutoSample: false,
      sampleUsed: null,
      needsManualSample: false,
      missingRequired: [],
      warnings: preview.warnings,
    });
  }

  const explicitSamples = body.samples;
  const isManual = Boolean(explicitSamples?.nome && explicitSamples?.preco);

  // ── Caminho manual: amostra veio explícita no corpo ──
  if (isManual) {
    const samples = explicitSamples as TxtSamples;
    const { detected, preview } = tryDetect(html, samples);
    const needsRetry = !detected.fields || preview?.broken === true;
    return NextResponse.json<DetectResponse>({
      config: detected.fields ? { fields: detected.fields, max_items: 200 } : null,
      preview,
      usedAutoSample: false,
      sampleUsed: samples,
      // Continua "manual" mesmo em caso de falha — não há mais nenhum
      // fallback depois deste; o admin ajusta e tenta de novo.
      needsManualSample: needsRetry,
      missingRequired: detected.missingRequired,
      warnings: [...detected.warnings, ...(preview?.warnings ?? [])],
    });
  }

  // ── Caminho automático: sem amostra, tenta o último produto coletado ──
  if (!storeId) {
    return NextResponse.json<DetectResponse>({
      config: null,
      preview: null,
      usedAutoSample: false,
      sampleUsed: null,
      needsManualSample: true,
      missingRequired: [],
      warnings: [],
    });
  }

  const effectiveBrand = brandAlias || storeName || "";
  const candidates = await deriveSamplesFromDb(storeId, storeType, effectiveBrand);
  if (candidates.length === 0) {
    // Loja nova ou sem nenhuma oferta ativa ainda — nada pra recuperar.
    return NextResponse.json<DetectResponse>({
      config: null,
      preview: null,
      usedAutoSample: false,
      sampleUsed: null,
      needsManualSample: true,
      missingRequired: [],
      warnings: [],
    });
  }

  for (const samples of candidates) {
    const { detected, preview } = tryDetect(html, samples);
    if (detected.fields && preview && !preview.broken) {
      return NextResponse.json<DetectResponse>({
        config: { fields: detected.fields, max_items: 200 },
        preview,
        usedAutoSample: true,
        sampleUsed: samples,
        needsManualSample: false,
        missingRequired: [],
        warnings: [...detected.warnings, ...preview.warnings],
      });
    }
  }

  // Nenhum candidato (nome como está, ou sem o prefixo de marca) funcionou —
  // é exatamente o caso em que a tela deve abrir a coleta manual.
  return NextResponse.json<DetectResponse>({
    config: null,
    preview: null,
    usedAutoSample: false,
    sampleUsed: candidates[0],
    needsManualSample: true,
    missingRequired: [],
    warnings: [
      "Não consegui confirmar automaticamente com o último produto coletado desta loja — confira o exemplo abaixo com um produto visível na página.",
    ],
  });
}
