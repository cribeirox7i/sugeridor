// Funções de leitura do catálogo, usadas pelas páginas públicas (Server
// Components). Recebem um client Supabase já criado pelo caller.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferListItem, Product, PriceHistoryPoint, Offer, Store, SiteSettings } from "./types";

export type OfferFilters = {
  estilo?: string;
  pais?: string;
  storeId?: string;
  brand?: string;
  precoMin?: number;
  precoMax?: number;
  q?: string;
};

// Categorias expostas no catálogo público (ver migration 0007/0008 e
// docs/05-roadmap.md) — 'souvenirs'/'eventos'/'copo' existem no banco
// (produtos que vieram junto de lojas de plataforma) mas ficam de fora daqui
// até termos UI pra outras categorias.
const PUBLIC_CATEGORIES = ["cervejas", "kit"];

const OFFER_SELECT = `
  id, product_id, store_id, price, currency, url, source_type, source_ref,
  active, last_seen_at, created_at, updated_at,
  product:products!inner ( id, name, brand, attributes, image_url, canonical_slug ),
  store:stores!inner ( id, name, logo_url )
`;

// Busca TODAS as ofertas ativas (categorias públicas), sem filtro — base
// única reaproveitada pra grid, facetas de filtro (estilo/país/loja) e
// destaques, em vez de uma query por consumidor (era o que deixava a home,
// e por tabela o popup de produto que reusa a mesma página, lenta: até 7
// idas ao banco pra montar uma única tela). Filtros de usuário (estilo,
// país, loja, faixa de preço) são aplicados depois, em memória, com
// `filterOffers` — o catálogo público é pequeno o bastante (uma categoria,
// algumas lojas) pra isso ser mais barato que reconsultar o banco a cada
// combinação de filtro.
export async function listOffers(supabase: SupabaseClient): Promise<OfferListItem[]> {
  const { data, error } = await supabase
    .from("offers")
    .select(OFFER_SELECT)
    .eq("active", true)
    .in("product.category", PUBLIC_CATEGORIES)
    .order("price", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OfferListItem[];
}

// Aplica os filtros de usuário em memória sobre o resultado de listOffers.
// A ordem por preço do listOffers é preservada (filter não reordena).
export function filterOffers(offers: OfferListItem[], filters: OfferFilters): OfferListItem[] {
  const q = filters.q?.trim().toLowerCase();
  return offers.filter((o) => {
    if (filters.storeId && o.store_id !== filters.storeId) return false;
    if (filters.precoMin != null && o.price < filters.precoMin) return false;
    if (filters.precoMax != null && o.price > filters.precoMax) return false;
    if (filters.estilo && o.product.attributes?.estilo !== filters.estilo) return false;
    if (filters.pais && o.product.attributes?.pais !== filters.pais) return false;
    if (filters.brand && o.product.brand !== filters.brand) return false;
    if (q) {
      const haystack = `${o.product.brand ?? ""} ${o.product.name}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export type OfferSort = "preco" | "nome" | "pais";

// Reordena o resultado já filtrado. 'preco' não precisa reordenar — listOffers
// já busca ordenado por preço e filterOffers preserva a ordem.
export function sortOffers(offers: OfferListItem[], sort: OfferSort | undefined): OfferListItem[] {
  if (!sort || sort === "preco") return offers;
  const sorted = [...offers];
  if (sort === "nome") {
    sorted.sort((a, b) => a.product.name.localeCompare(b.product.name, "pt-BR"));
  } else if (sort === "pais") {
    sorted.sort((a, b) => {
      const pa = String(a.product.attributes?.pais ?? "");
      const pb = String(b.product.attributes?.pais ?? "");
      return pa.localeCompare(pb, "pt-BR");
    });
  }
  return sorted;
}

// Valores distintos de um atributo (ex: todos os estilos existentes) pra
// montar as opções dos filtros — derivado do array de ofertas ATIVAS já
// buscado (não do currently-filtrado), pra nunca oferecer um valor que
// depois "esvazia" o resultado, e sempre a partir do catálogo completo (não
// só do que o filtro atual já reduziu).
export function distinctAttributeValues(offers: OfferListItem[], key: string): string[] {
  const set = new Set<string>();
  for (const o of offers) {
    const v = o.product.attributes?.[key];
    if (typeof v === "string" && v.trim()) set.add(v);
    else if (typeof v === "number") set.add(String(v));
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Marcas distintas, derivado do mesmo array de ofertas ativas — mesmo
// espírito de distinctAttributeValues, mas `brand` é coluna própria de
// `products` (não vive dentro de `attributes`), daí a função separada.
export function distinctBrandValues(offers: OfferListItem[]): string[] {
  const set = new Set<string>();
  for (const o of offers) {
    if (o.product.brand?.trim()) set.add(o.product.brand);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Lojas com pelo menos uma oferta ativa, derivado do mesmo array — usado
// tanto no dropdown de filtro quanto no carrossel de lojas da home.
export function storesWithActiveOffers(
  offers: OfferListItem[],
): Pick<Store, "id" | "name" | "logo_url">[] {
  return [...new Map(offers.map((o) => [o.store.id, o.store])).values()];
}

// Linha singleton com a logomarca do site. Se a migration 0004 ainda não
// rodou (coluna/tabela não existe), retorna null em vez de derrubar a página.
export async function getSiteSettings(supabase: SupabaseClient): Promise<SiteSettings | null> {
  const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (error) return null;
  return data as SiteSettings | null;
}

// Registro completo da loja (logo/descrição) pro cabeçalho da "página da
// loja" — listStoresLite só traz id/name, o suficiente pro dropdown de filtro.
export async function getStoreById(
  supabase: SupabaseClient,
  id: string,
): Promise<Pick<Store, "id" | "name" | "logo_url" | "description"> | null> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, logo_url, description")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProductBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("canonical_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

export async function getActiveOffersForProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<(Offer & { store: Pick<Store, "id" | "name"> })[]> {
  const { data, error } = await supabase
    .from("offers")
    .select("*, store:stores!inner ( id, name )")
    .eq("product_id", productId)
    .eq("active", true)
    .order("price", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as (Offer & { store: Pick<Store, "id" | "name"> })[];
}

// Série de preços de todas as ofertas de um produto, pra desenhar o histórico.
export async function getPriceHistoryForProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<PriceHistoryPoint[]> {
  const { data: offers, error: offersErr } = await supabase
    .from("offers")
    .select("id")
    .eq("product_id", productId);
  if (offersErr) throw offersErr;
  const offerIds = (offers ?? []).map((o) => o.id);
  if (offerIds.length === 0) return [];

  const { data, error } = await supabase
    .from("price_history")
    .select("*")
    .in("offer_id", offerIds)
    .order("captured_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PriceHistoryPoint[];
}

// Máximo de ids por lote na cláusula `.in()`. Uma única query com centenas de
// ids gera uma URL enorme; o fetch do Node estoura (`HEADERS_OVERFLOW`) bem
// antes de chegar no limite do Postgres, derrubando a página inteira. Testado
// que ~150 ids (URL ~5.6KB) passa com folga; 100 dá margem extra de segurança.
const OFFER_ID_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Histórico de várias ofertas de uma vez (evita N+1 numa listagem), agrupado
// por offer_id. Busca em lotes pra não estourar o limite de tamanho de URL
// quando há muitas ofertas ativas.
export async function getPriceHistoryForOffers(
  supabase: SupabaseClient,
  offerIds: string[],
): Promise<Map<string, PriceHistoryPoint[]>> {
  const map = new Map<string, PriceHistoryPoint[]>();
  if (offerIds.length === 0) return map;

  const batches = await Promise.all(
    chunk(offerIds, OFFER_ID_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await supabase
        .from("price_history")
        .select("*")
        .in("offer_id", batch)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PriceHistoryPoint[];
    }),
  );

  for (const point of batches.flat()) {
    const list = map.get(point.offer_id);
    if (list) list.push(point);
    else map.set(point.offer_id, [point]);
  }
  return map;
}

export type FeaturedDeal = OfferListItem & {
  dropPercent: number;
  referencePrice: number;
};

// Função pura (sem I/O) — separada pra dar pra testar isoladamente com dados
// sintéticos, sem precisar de rede/banco. Calcula a queda de preço de cada
// oferta frente ao "preço de referência" (média do histórico anterior ao
// ponto mais recente — mesma lógica descrita em docs/03-modelo-dados.md) e
// devolve as `limit` maiores quedas reais (> 0.5%, pra ignorar ruído).
// Genérica em T (não só OfferListItem) pra dar pra reusar tanto na home
// (lista com produto+loja) quanto na página de produto (lista só com loja) —
// mesma lógica de selo "-X%" nos dois lugares, sem duplicar.
export function computeFeaturedDeals<T extends { id: string; price: number }>(
  offers: T[],
  historyByOffer: Map<string, PriceHistoryPoint[]>,
  limit = 5,
): (T & { dropPercent: number; referencePrice: number })[] {
  const deals: (T & { dropPercent: number; referencePrice: number })[] = [];
  for (const offer of offers) {
    const history = historyByOffer.get(offer.id) ?? [];
    if (history.length < 2) continue; // sem histórico suficiente pra comparar

    // exclui o ponto mais recente (é o preço atual) da referência
    const previous = history.slice(0, -1);
    const referencePrice = previous.reduce((sum, p) => sum + p.price, 0) / previous.length;
    if (referencePrice <= 0) continue;

    const dropPercent = ((referencePrice - offer.price) / referencePrice) * 100;
    if (dropPercent > 0.5) {
      deals.push({ ...offer, dropPercent, referencePrice });
    }
  }

  return deals.sort((a, b) => b.dropPercent - a.dropPercent).slice(0, limit);
}
