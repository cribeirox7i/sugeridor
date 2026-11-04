-- Adiciona 'mercadolivre' ao constraint de plataformas aceitas.
-- O check anterior (migration 0003) listava só vtex/shopify/tray/jsonld/html/txt.
alter table stores drop constraint stores_platform_check;
alter table stores add constraint stores_platform_check
  check (platform in ('vtex', 'shopify', 'tray', 'jsonld', 'html', 'txt', 'mercadolivre'));
