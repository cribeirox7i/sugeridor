// Funções de leitura do catálogo, usadas pelas páginas públicas (Server
// Components). Recebem um client Supabase já criado pelo caller.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferListItem, Product, PriceHistoryPoint, Offer, Store, SiteSettings } from "./types";

export type OfferFilters = {
  estilo?: string;
  pais?: string;
  storeId?: string;
  precoMin?: number;
  precoMax?: number;
};

const OFFER_SELECT = `
  id, product_id, store_id, price, currency, url, source_type, source_ref,
  active, last_seen_at, created_at, updated_at,
  product:products!inner ( id, name, brand, attributes, image_url, canonical_slug ),
  store:stores!inner ( id, name, logo_url )
`;

// Lista ofertas ativas com o produto e a loja, aplicando filtros. Filtros por
// atributo (estilo/país) batem no JSONB de products.
export async function listOffers(
  supabase: SupabaseClient,
  filters: OfferFilters = {},
): Promise<OfferListItem[]> {
  let query = supabase
    .from("offers")
    .select(OFFER_SELECT)
    .eq("active", true)
    .order("price", { ascending: true });

  if (filters.storeId) query = query.eq("store_id", filters.storeId);
  if (filters.precoMin != null) query = query.gte("price", filters.precoMin);
  if (filters.precoMax != null) query = query.lte("price", filters.precoMax);
  if (filters.estilo) query = query.eq("product.attributes->>estilo", filters.estilo);
  if (filters.pais) query = query.eq("product.attributes->>pais", filters.pais);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as OfferListItem[];
}

// Valores distintos de um atributo (ex: todos os estilos existentes) pra montar
// as opções dos filtros. Sem RPC dedicada, buscamos os attributes e reduzimos
// no app — ok pro volume inicial.
export async function distinctAttributeValues(
  supabase: SupabaseClient,
  key: string,
): Promise<string[]> {
  const { data, error } = await supabase.from("products").select("attributes");
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    const v = (row.attributes as Record<string, unknown>)?.[key];
    if (typeof v === "string" && v.trim()) set.add(v);
    else if (typeof v === "number") set.add(String(v));
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Linha singleton com a logomarca do site. Se a migration 0004 ainda não
// rodou (coluna/tabela não existe), retorna null em vez de derrubar a página.
export async function getSiteSettings(supabase: SupabaseClient): Promise<SiteSettings | null> {
  const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (error) return null;
  return data as SiteSettings | null;
}

export async function listStoresLite(
  supabase: SupabaseClient,
): Promise<Pick<Store, "id" | "name">[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data ?? [];
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

// Histórico de várias ofertas de uma vez (evita N+1 numa listagem), agrupado
// por offer_id.
export async function getPriceHistoryForOffers(
  supabase: SupabaseClient,
  offerIds: string[],
): Promise<Map<string, PriceHistoryPoint[]>> {
  const map = new Map<string, PriceHistoryPoint[]>();
  if (offerIds.length === 0) return map;

  const { data, error } = await supabase
    .from("price_history")
    .select("*")
    .in("offer_id", offerIds)
    .order("captured_at", { ascending: true });
  if (error) throw error;

  for (const point of (data ?? []) as PriceHistoryPoint[]) {
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

// Base do carrossel de destaques da home — busca ofertas + histórico e aplica
// computeFeaturedDeals.
export async function getFeaturedDeals(
  supabase: SupabaseClient,
  limit = 5,
): Promise<FeaturedDeal[]> {
  const offers = await listOffers(supabase);
  if (offers.length === 0) return [];

  const historyByOffer = await getPriceHistoryForOffers(
    supabase,
    offers.map((o) => o.id),
  );

  return computeFeaturedDeals(offers, historyByOffer, limit);
}
