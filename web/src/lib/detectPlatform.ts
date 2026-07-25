import * as cheerio from "cheerio";

export type DetectResult = {
  platform: string | null;
  config: Record<string, unknown>;
  confidence: "high" | "low";
  note?: string;
};

const UA = "SugeridorBot/1.0 (+https://sugeridor.vercel.app; detector de plataforma)";

async function fetchText(url: string, timeoutMs = 9000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchJson(url: string, timeoutMs = 9000): Promise<unknown | null> {
  const text = await fetchText(url, timeoutMs);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const PRODUCT_PATH_PATTERNS = [
  "/produto/",
  "/produtos/",
  "/product/",
  "/products/",
  "/prod/",
  "/item/",
  "/p/",
];

// Acha o padrão de path mais comum entre os links da listagem (ex: "/produto/")
// e a classe CSS do ancestral mais próximo que se repete nesses links — a
// mesma coisa que fizemos manualmente pro Clube do Malte (.spot_container a).
function guessListingPattern(
  html: string,
  baseUrl: string,
): { linkSelector: string; urlContains: string; sampleLink: string } | null {
  const $ = cheerio.load(html);
  const anchors = $("a[href]").toArray();

  const patternCounts = new Map<string, number>();
  for (const el of anchors) {
    const href = $(el).attr("href") || "";
    for (const pattern of PRODUCT_PATH_PATTERNS) {
      if (href.includes(pattern)) {
        patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
      }
    }
  }

  const sorted = [...patternCounts.entries()].sort((a, b) => b[1] - a[1]);
  const best = sorted[0];
  if (!best || best[1] < 4) return null; // sem padrão claro de listagem
  const [bestPattern] = best;

  // conta, entre os links que batem no padrão, qual classe CSS de ancestral
  // (subindo até 3 níveis) é a mais repetida — provável "card" do produto.
  const classCounts = new Map<string, number>();
  let sampleLink: string | null = null;

  for (const el of anchors) {
    const href = $(el).attr("href") || "";
    if (!href.includes(bestPattern)) continue;
    if (!sampleLink) sampleLink = href;

    let node = $(el);
    for (let depth = 0; depth < 3 && node.length; depth++) {
      const cls = node.attr("class");
      if (cls) {
        const firstClass = cls.trim().split(/\s+/)[0];
        if (firstClass) classCounts.set(firstClass, (classCounts.get(firstClass) ?? 0) + 1);
      }
      node = node.parent();
    }
  }

  const bestClass = [...classCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!sampleLink) return null;

  return {
    linkSelector: bestClass ? `.${bestClass} a` : "a",
    urlContains: bestPattern,
    sampleLink: new URL(sampleLink, baseUrl).toString(),
  };
}

function guessPageParam(url: string): string {
  const params = new URL(url).searchParams;
  for (const candidate of ["pagina", "page", "pg"]) {
    if (params.has(candidate)) return candidate;
  }
  return "pagina";
}

export async function detectPlatform(inputUrl: string): Promise<DetectResult> {
  let origin: string;
  try {
    origin = new URL(inputUrl).origin;
  } catch {
    return { platform: null, config: {}, confidence: "low", note: "URL inválida." };
  }

  // 1. Shopify: endpoint público /products.json
  const shopifyData = (await fetchJson(`${origin}/products.json?limit=1`)) as
    | { products?: unknown[] }
    | null;
  if (Array.isArray(shopifyData?.products)) {
    return { platform: "shopify", config: {}, confidence: "high" };
  }

  // 2. Tray Commerce: endpoint /web_api/products
  const trayData = (await fetchJson(`${origin}/web_api/products?page=1`)) as
    | { Products?: unknown[] }
    | null;
  if (Array.isArray(trayData?.Products)) {
    return { platform: "tray", config: {}, confidence: "high" };
  }

  // 3. Busca a própria URL informada pra seguir investigando (VTEX, jsonld)
  const html = await fetchText(inputUrl);
  if (!html) {
    return {
      platform: null,
      config: {},
      confidence: "low",
      note: "Não consegui acessar essa URL pra analisar.",
    };
  }

  if (/vteximg\.com\.br|vtexassets\.com|vtexcommercestable/i.test(html)) {
    const path = new URL(inputUrl).pathname.replace(/^\/+|\/+$/g, "");
    const suggestedUrl = path ? `${origin}/api/catalog_system/pub/products/search/${path}` : null;
    return {
      platform: "vtex",
      config: {},
      confidence: "low",
      note: suggestedUrl
        ? `Parece ser VTEX. Troque a URL de listagem por algo como: ${suggestedUrl} (ajuste a categoria se necessário).`
        : "Parece ser VTEX, mas não consegui sugerir a URL da API de busca — informe manualmente a URL de .../api/catalog_system/pub/products/search/<categoria>.",
    };
  }

  const guess = guessListingPattern(html, inputUrl);
  if (guess) {
    const productHtml = await fetchText(guess.sampleLink);
    if (productHtml && /"@type"\s*:\s*"Product"/i.test(productHtml)) {
      return {
        platform: "jsonld",
        config: {
          link_selector: guess.linkSelector,
          url_contains: guess.urlContains,
          page_param: guessPageParam(inputUrl),
          max_pages: 20,
        },
        confidence: guess.linkSelector === "a" ? "low" : "high",
      };
    }
  }

  return {
    platform: null,
    config: {},
    confidence: "low",
    note: "Não conseguimos detectar automaticamente essa plataforma — configure manualmente.",
  };
}
