-- ============================================================
-- NORMALIZAR PAÍS DO PRODUTO (attributes.pais) — item 9 da leva de
-- melhorias (2026-07-30): país com nome único, não combinado como
-- "Escócia, Reino Unido" (o pedido foi só "Escócia").
-- ============================================================
-- Ad-hoc, não é migration: é dado (attributes é JSONB), não schema. Rodar no
-- SQL Editor do Supabase depois do deploy — o scraper (jsonld.py, via
-- scraper/normalize.py::normalize_country) já grava produto NOVO já
-- normalizado; este script só corrige o que já estava gravado.
--
-- Idempotente: rodar de novo não muda nada (o WHERE só casa o valor sujo).
-- Acrescente mais linhas UPDATE aqui se aparecer outra variante — o mapa
-- Python (_COUNTRY_ALIASES em scraper/normalize.py) precisa ganhar a mesma
-- entrada, senão a próxima coleta volta a gravar a forma suja.

update products
set attributes = jsonb_set(attributes, '{pais}', '"Escócia"')
where attributes->>'pais' = 'Escócia, Reino Unido';

-- Confira antes de rodar em produção (opcional): lista todos os valores hoje,
-- pra achar variantes que este script ainda não cobre.
-- select distinct attributes->>'pais' as pais, count(*) from products
-- where attributes->>'pais' is not null group by 1 order by 2 desc;
