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

export type Store = {
  id: string;
  name: string;
  site_url: string | null;
  platform: ScraperPlatform | null;
  config: Record<string, unknown>;
  affiliate_program_id: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  product_type_id: string;
  name: string;
  brand: string | null;
  attributes: Record<string, string | number>;
  image_url: string | null;
  canonical_slug: string;
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
  store: Pick<Store, "id" | "name">;
};
