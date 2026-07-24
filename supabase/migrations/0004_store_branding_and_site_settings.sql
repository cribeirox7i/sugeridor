-- Campos de identidade visual da loja (logomarca + descrição) e uma tabela
-- singleton pra logomarca do próprio site (versão preta/branca, trocada
-- conforme o tema claro/escuro). Ver docs/03-modelo-dados.md.

alter table stores add column logo_url text;
alter table stores add column description text;

create table site_settings (
  id              int primary key default 1,
  logo_black_url  text,
  logo_white_url  text,
  updated_at      timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

insert into site_settings (id) values (1);

alter table site_settings enable row level security;

create policy "public read site_settings" on site_settings for select using (true);
create policy "auth update site_settings" on site_settings for update to authenticated using (true) with check (true);
