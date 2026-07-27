// Tipos do domínio. O catálogo é genérico por tipo de produto: campos fixos em
// colunas, campos específicos do tipo em `attributes` (JSONB). Ver
// docs/03-modelo-dados.md.

export type AttributeField = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
};

export type AttributeSchema = {
  fields: AttributeField[];
};

export type ProductType = {
  id: string;
  slug: string;
  name: string;
  attribute_schema: AttributeSchema;
  created_at: string;
};

export type ScraperPlatform = "vtex" | "shopify" | "tray" | "jsonld" | "html" | "txt";

// 'marketplace' revende várias marcas; 'propria' é a loja da própria
// cervejaria — só nesse caso os produtos sem marca/país herdam da loja
// (ver migration 0009 e scraper/enrich.py).
export type StoreType = "marketplace" | "propria";

export type Store = {
  id: string;
  name: string;
  site_url: string | null;
  platform: ScraperPlatform | null;
  config: Record<string, unknown>;
  logo_url: string | null;
  description: string | null;
  affiliate_program_id: string | null;
  include_in_collection: boolean;
  store_type: StoreType;
  country: string;
  // Dias sem ser vista pelo coletor até a oferta desta loja ser desativada.
  // null = usa o padrão global de site_settings (ver migration 0013).
  offer_expiration_days: number | null;
  created_at: string;
};

// Categorização de alto nível, independente do product_type — texto livre
// (ver migration 0007/0009), 'cervejas' e 'kit' são as únicas usadas
// publicamente por ora.
export type ProductCategory = "cervejas" | "souvenirs" | "eventos" | "kit" | "copo";

export type Product = {
  id: string;
  product_type_id: string;
  name: string;
  brand: string | null;
  attributes: Record<string, string | number>;
  image_url: string | null;
  canonical_slug: string;
  category: ProductCategory;
  created_at: string;
  updated_at: string;
};

export type Offer = {
  id: string;
  product_id: string;
  store_id: string;
  price: number;
  currency: string;
  url: string;
  source_type: "scrape" | "email" | "whatsapp_ocr" | "manual";
  source_ref: string | null;
  active: boolean;
  last_seen_at: string;
  // Queda de preço já calculada, mantida por trigger em price_history (ver
  // migration 0013). Antes a home recalculava isso a partir do histórico de
  // TODAS as ofertas ativas a cada renderização, o que não escala.
  // null = sem queda ou sem histórico suficiente pra comparar.
  reference_price: number | null;
  drop_percent: number | null;
  created_at: string;
  updated_at: string;
};

export type PriceHistoryPoint = {
  id: string;
  offer_id: string;
  price: number;
  captured_at: string;
};

// Formato "achatado" usado na listagem pública (join de offer + product + store).
export type OfferListItem = Offer & {
  product: Pick<
    Product,
    "id" | "name" | "brand" | "attributes" | "image_url" | "canonical_slug"
  >;
  store: Pick<Store, "id" | "name" | "logo_url">;
};

// Linha única (singleton) com a logomarca do site em duas variantes — preta
// (pro tema claro) e branca (pro tema escuro).
export type SiteSettings = {
  id: number;
  logo_black_url: string | null;
  logo_white_url: string | null;
  offer_expiration_days: number;
  updated_at: string;
};

export type AlertScope = "product" | "product_type" | "global";

export type PriceAlert = {
  id: string;
  scope: AlertScope;
  scope_id: string | null;
  threshold_percent: number;
  notify_channel: string;
  active: boolean;
  created_at: string;
};

export type AlertTrigger = {
  id: string;
  alert_id: string;
  offer_id: string;
  price_at_trigger: number;
  reference_price: number;
  drop_percent: number;
  triggered_at: string;
};
