-- Fase 3: avalia queda de preço automaticamente a cada ponto novo de
-- price_history (inserido tanto pelo scraper Python quanto pelo cadastro
-- manual de ofertas no admin) e grava em alert_triggers quando bate alguma
-- regra ativa de price_alerts. Ver docs/03-modelo-dados.md e docs/05-roadmap.md.

-- ── Policies de escrita pro admin autenticado (faltavam desde a 0002) ──────
create policy "auth full price_alerts" on price_alerts
  for all to authenticated using (true) with check (true);

create policy "auth read alert_triggers" on alert_triggers
  for select to authenticated using (true);

-- ── Função de avaliação ─────────────────────────────────────────────────
-- Reference_price = mesma lógica de computeFeaturedDeals em
-- web/src/lib/queries.ts: média do histórico anterior ao ponto mais
-- recente, limitada aos últimos 90 dias. Se as duas implementações
-- divergirem no futuro, uma delas está desatualizada — mantê-las alinhadas.
create or replace function evaluate_price_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference_price numeric(10, 2);
  v_drop_percent numeric(5, 2);
  v_product_id uuid;
  v_product_type_id uuid;
  v_alert record;
begin
  select avg(price) into v_reference_price
  from price_history
  where offer_id = new.offer_id
    and captured_at < new.captured_at
    and captured_at >= new.captured_at - interval '90 days';

  if v_reference_price is null or v_reference_price <= 0 then
    return new;
  end if;

  v_drop_percent := (v_reference_price - new.price) / v_reference_price * 100;
  if v_drop_percent <= 0 then
    return new;
  end if;

  select p.id, p.product_type_id into v_product_id, v_product_type_id
  from offers o
  join products p on p.id = o.product_id
  where o.id = new.offer_id;

  for v_alert in
    select id from price_alerts
    where active = true
      and threshold_percent <= v_drop_percent
      and (
        scope = 'global'
        or (scope = 'product' and scope_id = v_product_id)
        or (scope = 'product_type' and scope_id = v_product_type_id)
      )
  loop
    -- Dedup: não repete disparo pro mesmo (alert, offer) dentro de 24h,
    -- pra não spammar quando o preço continua baixo em coletas seguidas.
    if not exists (
      select 1 from alert_triggers
      where alert_id = v_alert.id
        and offer_id = new.offer_id
        and triggered_at >= now() - interval '24 hours'
    ) then
      insert into alert_triggers (alert_id, offer_id, price_at_trigger, reference_price, drop_percent)
      values (v_alert.id, new.offer_id, new.price, v_reference_price, v_drop_percent);
    end if;
  end loop;

  return new;
end;
$$;

create trigger price_history_evaluate_alerts
  after insert on price_history
  for each row execute function evaluate_price_alerts();

-- ── Seed: alerta global padrão (editável/desativável no admin) ────────────
insert into price_alerts (scope, threshold_percent, notify_channel, active)
values ('global', 15.00, 'email', true);
