-- Fase 2 (refactor): migra de "um módulo Python por loja" (scraper_key) pra
-- "coletor genérico por plataforma + config JSONB por loja" (platform/config).
-- Ver docs/04-conectores-ingestao.md e scraper/platforms/.

alter table stores add column platform text
  check (platform in ('vtex', 'shopify', 'tray', 'jsonld', 'html', 'txt'));
alter table stores add column config jsonb not null default '{}'::jsonb;

-- Migra a loja que usava o scraper específico 'clubedomalte' pra platform
-- 'jsonld' genérica, com a config equivalente ao que o código fazia.
update stores
set
  platform = 'jsonld',
  config = '{
    "link_selector": ".spot_container a",
    "url_contains": "/produto/",
    "page_param": "pagina",
    "max_pages": 20
  }'::jsonb
where scraper_key = 'clubedomalte';

alter table stores drop column scraper_key;
