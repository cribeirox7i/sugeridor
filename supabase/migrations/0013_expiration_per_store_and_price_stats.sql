-- Duas mudanças para o catálogo escalar a 100+ lojas sem estourar o plano do
-- Supabase (projeção medida: com 150 lojas a 1 coleta/dia, o price_history
-- passaria de 4,8 milhões de linhas por ano).

-- ── 1. Prazo de expiração por loja ───────────────────────────────
-- A expiração automática já existia, mas com um prazo único pra todo mundo
-- (site_settings.offer_expiration_days). Uma loja que atualiza o catálogo
-- devagar merece prazo maior que uma que muda toda semana.
-- NULL = usa o padrão global, então nada muda pra quem não configurar.
alter table stores add column offer_expiration_days int;

comment on column stores.offer_expiration_days is
  'Dias sem ser vista pelo coletor até a oferta desta loja ser desativada. NULL = usa site_settings.offer_expiration_days.';

-- ── 2. Queda de preço materializada na oferta ────────────────────
-- Antes a home buscava o price_history de TODAS as ofertas ativas a cada
-- renderização só pra calcular o selo "-X%" e os destaques. Isso é ~600KB
-- por visita hoje, mas com 13 mil ofertas e um ano de pontos viraria dezenas
-- de MB por visita — o egress do plano acabaria antes do disco.
--
-- Guardar o resultado na própria oferta troca isso por zero consulta extra.
-- O cálculo fica no Postgres, junto do trigger de alerta de preço, seguindo a
-- mesma decisão de arquitetura da migration 0005: uma implementação só, no
-- banco, em vez de duplicar a regra em Python e em TypeScript.
alter table offers add column reference_price numeric(10,2);
alter table offers add column drop_percent numeric(5,2);

comment on column offers.drop_percent is
  'Queda % do preço atual frente à média do histórico anterior. Mantido por trigger em price_history; NULL = sem queda ou sem histórico suficiente.';

-- Mesma definição de "preço de referência" usada em computeFeaturedDeals
-- (web/src/lib/queries.ts): média dos pontos ANTERIORES ao mais recente, e
-- exige pelo menos um ponto anterior pra ter com o que comparar.
create or replace function refresh_offer_price_stats() returns trigger as $$
declare
  ref numeric;
begin
  select avg(price) into ref
    from price_history
   where offer_id = new.offer_id
     and id <> new.id;

  update offers
     set reference_price = round(ref, 2),
         drop_percent = case
           when ref is not null and ref > 0 and new.price < ref
             then round(((ref - new.price) / ref) * 100, 2)
           else null
         end
   where id = new.offer_id;

  return null;
end;
$$ language plpgsql;

-- Trigger separado do de alerta (evaluate_price_alerts) de propósito: são
-- responsabilidades diferentes — um decide o que exibir no site, o outro
-- registra disparo de regra configurada.
create trigger price_history_refresh_offer_stats
  after insert on price_history
  for each row execute function refresh_offer_price_stats();

-- ── 3. Backfill do que já está gravado ───────────────────────────
-- Sem isso, as ofertas existentes ficariam sem selo até o próximo ponto de
-- histórico entrar. Repete a mesma conta do trigger sobre o histórico atual:
-- média de todos os pontos menos o mais recente.
with ultimo as (
  select distinct on (offer_id) offer_id, id, price
    from price_history
   order by offer_id, captured_at desc, id desc
),
referencia as (
  select ph.offer_id, avg(ph.price) as ref
    from price_history ph
    join ultimo u on u.offer_id = ph.offer_id
   where ph.id <> u.id
   group by ph.offer_id
)
update offers o
   set reference_price = round(r.ref, 2),
       drop_percent = case
         when r.ref > 0 and u.price < r.ref
           then round(((r.ref - u.price) / r.ref) * 100, 2)
         else null
       end
  from referencia r
  join ultimo u on u.offer_id = r.offer_id
 where o.id = r.offer_id;
