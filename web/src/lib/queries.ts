// Funções de leitura do catálogo, usadas pelas páginas públicas (Server
// Components). Recebem um client Supabase já criado pelo caller.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferListItem, Product, PriceHistoryPoint, Offer, Store } from "./types";

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
  store:stores!inner ( id, name )
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
