-- Fase 1: seed do primeiro tipo de produto + policies de escrita pro admin.
-- Ver docs/03-modelo-dados.md e docs/05-roadmap.md.

-- ── Seed: product_type 'cerveja' ─────────────────────────────────
-- attribute_schema descreve os campos específicos desse tipo, usado pra montar
-- o formulário dinâmico do admin. Cada campo: type (text|number|select), label,
-- e options (quando select).
insert into product_types (slug, name, attribute_schema)
values (
  'cerveja',
  'Cerveja',
  '{
    "fields": [
      { "key": "estilo", "label": "Estilo", "type": "text" },
      { "key": "pais", "label": "País", "type": "text" },
      { "key": "volume_ml", "label": "Volume (ml)", "type": "number" },
      { "key": "abv", "label": "Teor alcoólico (%)", "type": "number" }
    ]
  }'::jsonb
)
on conflict (slug) do nothing;

-- ── Policies de escrita para o role authenticated ────────────────
-- Só admins conseguem logar (não há signup público), então tratamos qualquer
-- usuário autenticado como admin: acesso total de leitura e escrita ao catálogo.
-- (As escritas do pipeline automático — GitHub Actions — usarão a service_role
-- key, que ignora RLS; estas policies são pro admin logado no site.)

create policy "auth full product_types" on product_types
  for all to authenticated using (true) with check (true);

create policy "auth full stores" on stores
  for all to authenticated using (true) with check (true);

create policy "auth full products" on products
  for all to authenticated using (true) with check (true);

create policy "auth full offers" on offers
  for all to authenticated using (true) with check (true);

create policy "auth full price_history" on price_history
  for all to authenticated using (true) with check (true);

create policy "auth full affiliate_programs" on affiliate_programs
  for all to authenticated using (true) with check (true);
