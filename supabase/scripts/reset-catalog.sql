-- ============================================================
-- LIMPEZA DO CATÁLOGO — apaga ofertas e produtos pra recarregar a base
-- ============================================================
-- NÃO é uma migration (por isso vive em supabase/scripts/, não em
-- supabase/migrations/): é utilitário de manutenção, rodado à mão no SQL
-- Editor do Supabase quando se quer reimportar o catálogo do zero.
--
-- APAGA:
--   * alert_triggers  (histórico de disparos de alerta de preço)
--   * price_history   (TODO o histórico de preço — ver aviso abaixo)
--   * offers          (todas as ofertas)
--   * products        (todos os produtos)
--
-- PRESERVA (de propósito):
--   * stores           — as lojas e suas configs de coleta (plataforma, URL,
--                        tipo de loja, país, include_in_collection)
--   * product_types    — o seed "Cerveja" e seu attribute_schema
--   * category_keywords— as palavras-chave de classificação (migrations 0011/0012)
--   * site_settings    — logomarca e dias de expiração de oferta
--   * price_alerts     — as regras de alerta configuradas
--   * ingestion_jobs   — histórico de execuções do scraper
--
-- ⚠ AVISO: apagar price_history zera a base de comparação de preço. Os selos
-- "-X%" e o carrossel "Ofertas em destaque" ficam vazios até a segunda coleta
-- (precisam de 2+ pontos por oferta pra calcular queda). Isso é esperado, não
-- é bug — só não estranhe a home sem destaques logo depois.
--
-- A ordem dos deletes importa: as FKs são RESTRICT de propósito (não CASCADE),
-- pra ninguém apagar histórico sem perceber. alert_triggers referencia offers
-- sem cascade, então tem que sair primeiro; price_history TEM cascade em
-- offers, mas está explícito aqui pra ficar óbvio o que está sendo removido.

-- ── 1. Antes: o que existe hoje ──────────────────────────────
select 'ANTES' as momento,
       (select count(*) from products)       as produtos,
       (select count(*) from offers)         as ofertas,
       (select count(*) from price_history)  as pontos_historico,
       (select count(*) from alert_triggers) as disparos_alerta,
       (select count(*) from stores)         as lojas_preservadas;

-- ── 2. Limpeza, na ordem que as FKs exigem ───────────────────
begin;

delete from alert_triggers;
delete from price_history;
delete from offers;
delete from products;

commit;

-- ── 3. Depois: confirmação ───────────────────────────────────
-- produtos/ofertas/histórico devem estar em 0; lojas, tipos e palavras-chave
-- devem continuar com os mesmos números de antes.
select 'DEPOIS' as momento,
       (select count(*) from products)          as produtos,
       (select count(*) from offers)            as ofertas,
       (select count(*) from price_history)     as pontos_historico,
       (select count(*) from alert_triggers)    as disparos_alerta,
       (select count(*) from stores)            as lojas_preservadas,
       (select count(*) from product_types)     as tipos_preservados,
       (select count(*) from category_keywords) as keywords_preservadas,
       (select count(*) from price_alerts)      as alertas_preservados;

-- ── 4. Conferência das lojas que vão ser coletadas ───────────
-- Boa hora pra revisar antes de disparar a coleta: só entram na coleta as
-- lojas com platform preenchido E include_in_collection = true. Confira se a
-- URL da Cerveja Box está no formato de API do VTEX
-- (/api/catalog_system/pub/products/search/...) — a URL da página coleta 0
-- itens sem dar erro.
select name,
       store_type,
       country,
       platform,
       include_in_collection,
       site_url
from stores
order by include_in_collection desc, platform nulls last, name;
