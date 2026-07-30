-- Leva de melhorias (2026-07-30): visibilidade manual de produto, loja
-- ativa/inativa (separado de include_in_collection) e loja "vendedor
-- WhatsApp" (cadastro manual, sem site_url, oferta direciona pro wa.me).

-- Item 2: ocultar produto manualmente, sem afetar a coleta nem apagar dado —
-- o scraper continua atualizando preço/histórico normalmente, só o filtro de
-- leitura pública (listOffers) passa a excluir hidden=true.
alter table products add column hidden boolean not null default false;

-- Item 10: ativa/inativa é um flag NOVO, separado de include_in_collection —
-- loja inativa sai do site (home/carrossel/ /lojas) e da coleta; reativar não
-- liga a coleta de volta sozinho (o admin decide os dois separadamente).
alter table stores add column active boolean not null default true;

-- Item 3: loja "vendedor WhatsApp" — cadastro manual, sem platform, e a
-- oferta pode não ter uma URL de produto (o "Ver oferta" vai direto pro
-- número). offers.url era not null desde a migration 0001; essas lojas não
-- têm link de produto nenhum pra colocar lá.
alter table stores add column whatsapp_number text;
alter table offers alter column url drop not null;
