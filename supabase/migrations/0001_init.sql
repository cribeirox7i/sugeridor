-- Schema inicial do Sugeridor (hub de ofertas). Ver docs/03-modelo-dados.md.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ── product_types ────────────────────────────────────────────────
create table product_types (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  attribute_schema jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- ── affiliate_programs ───────────────────────────────────────────
create table affiliate_programs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  link_template text not null,
  active        boolean not null default false
);

-- ── stores ────────────────────────────────────────────────────────
create table stores (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  site_url              text,
  scraper_key           text,
  affiliate_program_id  uuid references affiliate_programs(id),
  created_at            timestamptz not null default now()
);

-- ── products ──────────────────────────────────────────────────────
create table products (
  id              uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references product_types(id),
  name            text not null,
  brand           text,
  attributes      jsonb not null default '{}'::jsonb,
  image_url       text,
  canonical_slug  text not null unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index products_attributes_gin_idx on products using gin (attributes);
create index products_name_trgm_idx on products using gin (name gin_trgm_ops);
create index products_brand_trgm_idx on products using gin (brand gin_trgm_ops);

-- ── raw_captures ──────────────────────────────────────────────────
create table raw_captures (
  id                uuid primary key default gen_random_uuid(),
  source_type       text not null check (source_type in ('scrape', 'email', 'whatsapp_ocr', 'manual')),
  raw_payload       jsonb,
  image_path        text,
  processed         boolean not null default false,
  processing_error  text,
  created_at        timestamptz not null default now()
);

-- ── offers ────────────────────────────────────────────────────────
create table offers (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id),
  store_id     uuid not null references stores(id),
  price        numeric(10, 2) not null,
  currency     text not null default 'BRL',
  url          text not null,
  source_type  text not null check (source_type in ('scrape', 'email', 'whatsapp_ocr', 'manual')),
  source_ref   uuid references raw_captures(id),
  active       boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (product_id, store_id)
);

create index offers_price_idx on offers (price);
create index offers_store_idx on offers (store_id);

-- ── price_history ─────────────────────────────────────────────────
create table price_history (
  id          uuid primary key default gen_random_uuid(),
  offer_id    uuid not null references offers(id) on delete cascade,
  price       numeric(10, 2) not null,
  captured_at timestamptz not null default now()
);

create index price_history_offer_captured_idx on price_history (offer_id, captured_at desc);

-- ── price_alerts ──────────────────────────────────────────────────
create table price_alerts (
  id                uuid primary key default gen_random_uuid(),
  scope             text not null check (scope in ('product', 'product_type', 'global')),
  scope_id          uuid,
  threshold_percent numeric(5, 2) not null,
  notify_channel    text not null default 'email',
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ── alert_triggers ────────────────────────────────────────────────
create table alert_triggers (
  id                uuid primary key default gen_random_uuid(),
  alert_id          uuid not null references price_alerts(id),
  offer_id          uuid not null references offers(id),
  price_at_trigger  numeric(10, 2) not null,
  reference_price   numeric(10, 2) not null,
  drop_percent      numeric(5, 2) not null,
  triggered_at      timestamptz not null default now()
);

-- ── ingestion_jobs ────────────────────────────────────────────────
create table ingestion_jobs (
  id            uuid primary key default gen_random_uuid(),
  job_type      text not null check (job_type in ('scrape', 'email_sync')),
  store_id      uuid references stores(id),
  status        text not null check (status in ('running', 'success', 'partial', 'failed')),
  items_found   int not null default 0,
  items_new     int not null default 0,
  error_message text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- ── RLS: leitura pública do catálogo, escrita só via service_role ──
alter table product_types enable row level security;
alter table affiliate_programs enable row level security;
alter table stores enable row level security;
alter table products enable row level security;
alter table offers enable row level security;
alter table price_history enable row level security;
alter table price_alerts enable row level security;
alter table alert_triggers enable row level security;
alter table raw_captures enable row level security;
alter table ingestion_jobs enable row level security;

create policy "public read product_types" on product_types for select using (true);
create policy "public read stores" on stores for select using (true);
create policy "public read products" on products for select using (true);
create policy "public read offers" on offers for select using (active = true);
create policy "public read price_history" on price_history for select using (true);

-- affiliate_programs, price_alerts, alert_triggers, raw_captures e ingestion_jobs não têm
-- policy de leitura pública: só acessíveis via service_role key (usada pelo backend/admin/GH Actions).
