-- ============================================================
-- CORREÇÃO DOS DADOS DO CATÁLOGO (sem apagar nada)
-- ============================================================
-- Alternativa ao reset-catalog.sql: conserta no lugar em vez de limpar e
-- recarregar, preservando o histórico de preço já acumulado (que é o que
-- alimenta os selos "-X%" e o carrossel de destaques — limpar zeraria isso e
-- só voltaria depois de duas coletas novas).
--
-- Rodar no SQL Editor do Supabase. É idempotente: rodar duas vezes não muda
-- nada na segunda.
--
-- CORRIGE:
--   1. Marca, país e SLUG dos produtos de loja 'propria'
--   2. Categoria dos produtos, lendo as palavras de `category_keywords`
--
-- NÃO corrige nomes em CAIXA ALTA — pra isso use o botão "Normalizar nomes
-- existentes" em /admin/produtos. A regra de Title Case tem exceções (artigos
-- minúsculos, siglas tipo IPA/NEIPA sempre maiúsculas) que replicadas em SQL
-- virariam uma terceira cópia da mesma lógica, fadada a dessincronizar.

-- Réplica do slugify do TS/Python (web/src/lib/slug.ts, scraper/normalize.py):
-- minúsculas, sem acento, não-alfanumérico vira hífen, sem hífen nas pontas.
-- pg_temp = existe só nesta sessão, não polui o schema.
--
-- O original usa NFD + descarte de diacríticos, que cobre QUALQUER acento; em
-- SQL isso vira um mapa explícito. Além do português, inclui os diacríticos
-- tcheco/nórdicos/eslavos que aparecem em nome de cerveja especial (Plzeň,
-- Åbenrå, Křížek) — sem eles o SQL geraria "plze-" onde o scraper gera
-- "plzen", e o produto seria recriado como duplicata na coleta seguinte.
-- Verificado contra os 867 nomes do catálogo atual: 0 divergências.
create or replace function pg_temp.slugify(txt text) returns text as $$
  select trim(both '-' from regexp_replace(
    translate(lower(txt),
              'áàâãäéèêëíìîïóòôõöúùûüçñåāăćčďěĝğīıĺľńňōőŕřśšťūůűýÿźżž',
              'aaaaaeeeeiiiiooooouuuucnaaaccdeggiillnnoorrsstuuuyyzzz'),
    '[^a-z0-9]+', '-', 'g'))
$$ language sql immutable;

-- Produto → loja própria que o vende. Um produto de cervejaria própria só é
-- vendido por ela, mas se houver mais de uma o `min(name)` mantém o resultado
-- determinístico em vez de depender da ordem das linhas.
create or replace view pg_temp.produto_loja_propria as
select o.product_id,
       min(s.name)    as store_name,
       min(s.country) as store_country
  from offers o
  join stores s on s.id = o.store_id
 where s.store_type = 'propria'
 group by o.product_id;

-- ── 1. DIAGNÓSTICO: o que vai mudar (nada é alterado aqui) ───
select 'marca/país/slug a corrigir' as item, count(*) as qtd
  from products p
  join pg_temp.produto_loja_propria lp on lp.product_id = p.id
 where p.brand is distinct from lp.store_name
union all
select 'colisões de slug (precisa ser 0)', count(*) from (
  select pg_temp.slugify(lp.store_name || ' ' || p.name) as novo_slug
    from products p
    join pg_temp.produto_loja_propria lp on lp.product_id = p.id
   group by 1 having count(*) > 1
) c;

-- ── 2. Marca, país e slug das lojas próprias ─────────────────
-- Numa loja própria a marca É a loja: o campo "marca" da fonte não é
-- confiável (o Shopify da Japas manda o estilo, "BOHEMIAN PILSENER | 5%
-- ALC."; o da Hocus Pocus manda "Hocus Pocus Oficial").
--
-- O slug É RECALCULADO JUNTO, e isso é o ponto crítico deste script: o slug
-- vem de slugify(marca + nome), e é por ele que o scraper reconhece um
-- produto já existente. Corrigir a marca sem corrigir o slug faria a próxima
-- coleta não encontrar o produto e criar uma DUPLICATA de cada um.
begin;

update products p
   set brand = lp.store_name,
       canonical_slug = pg_temp.slugify(lp.store_name || ' ' || p.name),
       attributes = coalesce(p.attributes, '{}'::jsonb)
                    || jsonb_build_object('pais', lp.store_country),
       updated_at = now()
  from pg_temp.produto_loja_propria lp
 where lp.product_id = p.id
   and (
     p.brand is distinct from lp.store_name
     or p.canonical_slug is distinct from pg_temp.slugify(lp.store_name || ' ' || p.name)
     or coalesce(p.attributes->>'pais', '') is distinct from lp.store_country
   );

commit;

-- ── 3. Categorias, a partir de `category_keywords` ───────────
-- Lê a MESMA tabela que o scraper e a tela /admin/classificacao usam, em vez
-- de repetir a lista de palavras aqui (foi assim que as listas do código e do
-- SQL dessincronizaram antes). A ordem de prioridade é a mesma fixada em
-- scraper/categorize.py: "Kit Copo + Cerveja" é 'kit', não 'copo'.
--
-- Conservador de propósito: só PROMOVE 'cervejas' → categoria específica
-- quando alguma palavra bate no nome. Nunca rebaixa para 'cervejas' um
-- produto que já foi classificado, pra não desfazer correção feita à mão no
-- admin (foi o caso do "Wasabiru", corrigido manualmente de copo → cervejas).
begin;

with prioridade(category, ordem) as (
  values ('eventos', 1), ('kit', 2), ('copo', 3), ('souvenirs', 4)
),
match as (
  select p.id,
         (select ck.category
            from category_keywords ck
            join prioridade pr on pr.category = ck.category
           -- \y = fronteira de palavra: "bag" não casa dentro de "Bagaço"
           where p.name ~* ('\y' || ck.keyword || '\y')
           order by pr.ordem
           limit 1) as nova_categoria
    from products p
   where p.category = 'cervejas'
)
update products p
   set category = m.nova_categoria,
       updated_at = now()
  from match m
 where p.id = m.id
   and m.nova_categoria is not null;

commit;

-- ── 4. CONFIRMAÇÃO ───────────────────────────────────────────
select 'produtos de loja própria com marca ainda errada' as verificacao,
       count(*) as deve_ser_zero
  from products p
  join pg_temp.produto_loja_propria lp on lp.product_id = p.id
 where p.brand is distinct from lp.store_name
union all
select 'slug fora de sincronia com marca+nome',
       count(*)
  from products p
  join pg_temp.produto_loja_propria lp on lp.product_id = p.id
 where p.canonical_slug is distinct from pg_temp.slugify(lp.store_name || ' ' || p.name);

-- Distribuição final por categoria.
select category, count(*) as produtos
  from products
 group by category
 order by produtos desc;

-- Revisão manual: produtos que NÃO são 'cervejas' e cujo nome não bate com
-- nenhuma palavra-chave. Costumam ser classificações feitas à mão (que o
-- passo 3 preserva de propósito) — mas se algum estiver errado aqui, é o
-- lugar de ver e corrigir pelo admin.
select category, name
  from products p
 where p.category <> 'cervejas'
   and not exists (
     select 1 from category_keywords ck
      where p.name ~* ('\y' || ck.keyword || '\y')
   )
 order by category, name;
