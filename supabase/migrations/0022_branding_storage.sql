-- Bucket público pra guardar a logomarca do site (web/src/app/[locale]/admin/
-- (painel)/config/brandingActions.ts). Antes o admin colava uma URL externa
-- (a imagem "morava" em outro lugar); agora o arquivo é enviado e guardado
-- aqui mesmo, no próprio Supabase do projeto — mesma origem dos dados.
--
-- Público pra leitura (a logo aparece no site sem sessão), mas só usuário
-- autenticado (o admin logado) pode gravar — mesmo padrão de
-- "auth update site_settings" na migration 0004.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "public read branding"
  on storage.objects for select
  using (bucket_id = 'branding');

create policy "auth write branding"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'branding');

create policy "auth update branding"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'branding')
  with check (bucket_id = 'branding');

create policy "auth delete branding"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'branding');
