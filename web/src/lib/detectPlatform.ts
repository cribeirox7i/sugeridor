import * as cheerio from "cheerio";

export type DetectResult = {
  platform: string | null;
  config: Record<string, unknown>;
  confidence: "high" | "low";
  note?: string;
  logo_url?: string;
  description?: string;
  name?: string;
  // Quando presente, a URL de listagem informada precisa ser TROCADA por
  // esta pra a coleta funcionar (caso do VTEX, cujo coletor só aceita o
  // endpoint da API de busca). Quem chama aplica no campo de URL.
  site_url?: string;
};

// UA de navegador comum — ver docs/06-riscos-e-legal.md (decisão revista em
// 2026-07-31, mesmo motivo do scraper Python: um UA identificável era
// bloqueado por WAFs mesmo em lojas cujo robots.txt não proíbe raspagem).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

// Logo: tenta JSON-LD Organization (mais confiável, quando existe), depois
// og:image, depois favicon/apple-touch-icon. Descrição: meta description.
// Roda sobre a home da loja (não a listagem), onde esses metadados de site
// geralmente vivem — usado só uma vez, no momento de detectar a plataforma,
// não a cada coleta periódica de produtos.
function extractBranding(
  html: string,
  baseUrl: string,
): { logo_url?: string; description?: string; name?: string } {
  const $ = cheerio.load(html);
  const result: { logo_url?: string; description?: string; name?: string } = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    if (result.logo_url) return;
    try {
      const data = JSON.parse($(el).contents().text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = item?.["@type"];
        const isOrg = type === "Organization" || (Array.isArray(type) && type.includes("Organization"));
        if (!isOrg) continue;
        if (typeof item.logo === "string") {
          result.logo_url = absolutize(item.logo, baseUrl);
        } else if (item.logo && typeof item.logo.url === "string") {
          result.logo_url = absolutize(item.logo.url, baseUrl);
        }
        if (!result.name && typeof item.name === "string" && item.name.trim()) {
          result.name = item.name.trim();
        }
        if (result.logo_url) break;
      }
    } catch {
      // bloco JSON-LD inválido — ignora e tenta o próximo
    }
  });

  if (!result.logo_url) {
    const og = $('meta[property="og:image"]').attr("content");
    if (og) result.logo_url = absolutize(og, baseUrl);
  }
  if (!result.logo_url) {
    const icon = $('link[rel="apple-touch-icon"]').attr("href") || $('link[rel="icon"]').attr("href");
    if (icon) result.logo_url = absolutize(icon, baseUrl);
  }

  const desc = $('meta[name="description"]').attr("content");
  if (desc && desc.trim()) result.description = desc.trim();

  // Nome da loja: og:site_name é o metadado feito exatamente pra isso; o
  // <title> vem por último porque costuma trazer slogan junto ("Loja X — a
  // maior cervejaria do Sul"), então corta no primeiro separador.
  if (!result.name) {
    const siteName = $('meta[property="og:site_name"]').attr("content");
    if (siteName && siteName.trim()) result.name = siteName.trim();
  }
  if (!result.name) {
    const title = $("title").first().text();
    if (title && title.trim()) {
      result.name = title.split(/[|—–\-:·]/)[0].trim() || title.trim();
    }
  }

  return result;
}

function guessPageParam(url: string): string {
  const params = new URL(url).searchParams;
  for (const candidate of ["pagina", "page", "pg"]) {
    if (params.has(candidate)) return candidate;
  }
  return "pagina";
}

// Bloqueia fetch para IPs privados/loopback/link-local e esquemas não-HTTP —
// defesa contra SSRF via URL de loja fornecida pelo admin.
// Nota: não protege contra DNS rebinding (hostname público que resolve para IP
// privado no momento real do fetch). Para esse vetor, a mitigação mais eficaz
// seria resolver o IP antes de conectar (não disponível no fetch padrão do
// Node/Edge sem lib externa). O risco prático é baixo dado que a rota já exige
// admin logado, mas a defesa em profundidade impede o caso trivial.
function isSafeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const host = parsed.hostname.toLowerCase();

  // localhost e sufixos de rede interna
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }

  // IPv4: bloqueia loopback, privados, link-local e metadata da nuvem
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (
      a === 0 ||                              // 0.0.0.0/8
      a === 10 ||                             // 10.0.0.0/8
      a === 127 ||                            // 127.0.0.0/8 (loopback)
      (a === 100 && b >= 64 && b <= 127) ||   // 100.64.0.0/10 (shared)
      (a === 169 && b === 254) ||             // 169.254.0.0/16 (link-local / metadata AWS/GCP/Azure)
      (a === 172 && b >= 16 && b <= 31) ||    // 172.16.0.0/12
      (a === 192 && b === 168) ||             // 192.168.0.0/16
      (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 (benchmark)
      a >= 240                                // 240.0.0.0/4 (reservado)
    ) {
      return false;
    }
  }

  // IPv6: loopback e ranges privados/link-local
  const bare = host.replace(/^\[|\]$/g, "");
  if (
    bare === "::1" ||
    bare.startsWith("fc") ||  // ULA fc00::/7
    bare.startsWith("fd") ||
    bare.startsWith("fe80")   // link-local
  ) {
    return false;
  }

  return true;
}

export async function detectPlatform(inputUrl: string): Promise<DetectResult> {
  let origin: string;
  try {
    origin = new URL(inputUrl).origin;
  } catch {
    return { platform: null, config: {}, confidence: "low", note: "URL inválida." };
  }

  if (!isSafeUrl(inputUrl)) {
    return { platform: null, config: {}, confidence: "low", note: "URL não permitida." };
  }

  // Mercado Livre: detectado pelo hostname, sem precisar buscar a página.
  if (/mercadolivre\.com(\.br)?$/i.test(new URL(inputUrl).hostname)) {
    return {
      platform: "meli",
      config: {},
      confidence: "high",
      note: "Mercado Livre detectado. Certifique-se de usar a URL da loja do vendedor (mercadolivre.com.br/loja/nome-do-vendedor).",
    };
  }

  // Logo/descrição vêm da home da loja (metadados de site, não da listagem),
  // buscada uma vez aqui independente de qual plataforma for detectada.
  const homeHtml = await fetchText(origin);
  const branding = homeHtml ? extractBranding(homeHtml, origin) : {};

  // 1. Shopify: endpoint público /products.json
  const shopifyData = (await fetchJson(`${origin}/products.json?limit=1`)) as
    | { products?: unknown[] }
    | null;
  if (Array.isArray(shopifyData?.products)) {
    return { platform: "shopify", config: {}, confidence: "high", ...branding };
  }

  // 2. Tray Commerce: endpoint /web_api/products
  const trayData = (await fetchJson(`${origin}/web_api/products?page=1`)) as
    | { Products?: unknown[] }
    | null;
  if (Array.isArray(trayData?.Products)) {
    return { platform: "tray", config: {}, confidence: "high", ...branding };
  }

  // 3. Busca a própria URL informada pra seguir investigando (VTEX, jsonld)
  const html = await fetchText(inputUrl);
  if (!html) {
    return {
      platform: null,
      config: {},
      confidence: "low",
      note: "Não consegui acessar essa URL pra analisar.",
      ...branding,
    };
  }

  if (/vteximg\.com\.br|vtexassets\.com|vtexcommercestable/i.test(html)) {
    // O coletor VTEX só funciona com o endpoint da API de busca — a URL da
    // página de categoria devolve HTML, o que fazia a loja coletar 0 itens
    // *sem erro nenhum* (aconteceu de verdade com a Cerveja Box). Antes isso
    // era só uma sugestão em texto, invisível no botão compacto do card;
    // agora a URL corrigida é testada e aplicada.
    const path = new URL(inputUrl).pathname.replace(/^\/+|\/+$/g, "");
    const apiBase = `${origin}/api/catalog_system/pub/products/search`;
    const candidates = path ? [`${apiBase}/${path}`, apiBase] : [apiBase];

    for (const candidate of candidates) {
      const probe = await fetchJson(`${candidate}?_from=0&_to=1`);
      if (Array.isArray(probe) && probe.length > 0) {
        return {
          platform: "vtex",
          config: {},
          confidence: "high",
          site_url: candidate,
          note: `VTEX confirmado. A URL de listagem foi trocada pela API de busca (${candidate}) — é o formato que o coletor usa.`,
          ...branding,
        };
      }
    }

    return {
      platform: "vtex",
      config: {},
      confidence: "low",
      note: `Parece ser VTEX, mas nenhuma URL de API respondeu com produtos. Informe manualmente algo como ${apiBase}/<categoria>.`,
      ...branding,
    };
  }

  const guess = guessListingPattern(html, inputUrl);
  if (guess) {
    if (!isSafeUrl(guess.sampleLink)) {
      return { platform: null, config: {}, confidence: "low", note: "Link de produto retornou URL interna — não foi possível detectar a plataforma.", ...branding };
    }
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
        ...branding,
      };
    }
  }

  return {
    platform: null,
    config: {},
    confidence: "low",
    note: "Não conseguimos detectar automaticamente essa plataforma — configure manualmente.",
    ...branding,
  };
}
