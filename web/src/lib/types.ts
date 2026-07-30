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
  // Forma curta do nome ("Dogma" para "Cervejaria Dogma"), usada como marca
  // dos produtos e como prefixo do nome deles em loja própria — o nome de um
  // produto é marca + descritivo ("Dogma IPA", não "IPA"). Ver migration 0015.
  // null = usa `name`.
  brand_alias: string | null;
  // Dias sem ser vista pelo coletor até a oferta desta loja ser desativada.
  // null = usa o padrão global de site_settings (ver migration 0013).
  offer_expiration_days: number | null;
  // Ativa/inativa (migration 0020) — separado de `include_in_collection`:
  // inativa some do site (home/carrossel/ /lojas) E sai da coleta; reativar
  // NÃO liga a coleta de volta sozinho. default true.
  active: boolean;
  // Loja "vendedor WhatsApp" (migration 0020): cadastro manual, sem
  // `site_url` de verdade — "Ver oferta" manda pro wa.me em vez de redirecionar
  // pra um link de produto. Formato esperado: só dígitos com DDI (ex:
  // "5511999999999"). null = loja normal (site/scraper).
  whatsapp_number: string | null;
  created_at: string;
};

// Categorização de alto nível, independente do product_type — texto livre
// (ver migration 0007/0009), 'cervejas' e 'kit' são as únicas usadas
// publicamente por ora. 'assinaturas' (item 11 da leva de melhorias,
// 2026-07-30) é reservada como as demais não-públicas: existe no banco e no
// admin (cadastro manual — não é algo que o scraper classifique por
// palavra-chave), mas fica de fora do catálogo público por ora.
export type ProductCategory = "cervejas" | "souvenirs" | "eventos" | "kit" | "copo" | "assinaturas";

export type Product = {
  id: string;
  product_type_id: string;
  name: string;
  brand: string | null;
  attributes: Record<string, string | number>;
  image_url: string | null;
  canonical_slug: string;
  category: ProductCategory;
  // Oculto do catálogo público por decisão manual (migration 0020) — a
  // coleta continua atualizando preço/histórico normalmente, só a leitura
  // pública (listOffers) exclui. default false.
  hidden: boolean;
  created_at: string;
  updated_at: string;
};

export type Offer = {
  id: string;
  product_id: string;
  store_id: string;
  price: number;
  currency: string;
  // null pra loja "vendedor WhatsApp" (migration 0020) — sem link de produto,
  // "Ver oferta" manda pro wa.me da loja em vez de redirecionar pra `url`.
  url: string | null;
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
