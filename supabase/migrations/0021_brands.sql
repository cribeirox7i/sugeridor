-- Item 1 da leva de melhorias (2026-07-30): catálogo normalizado de marcas
-- (nome canônico + país), substituindo o de/para (text_replacements) como
-- autoridade sobre `products.brand`. Ver docs/03-modelo-dados.md.

create table brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,          -- forma canônica, ex: "Paulaner"
  country    text,                   -- país de origem — null = desconhecido
  created_at timestamptz not null default now()
);
create unique index brands_name_key on brands (name);

-- Tabela separada (não array em `brands`) porque o admin adiciona/remove
-- variações uma a uma (mesmo raciocínio de `text_replacements` ser
-- linha-por-regra) e porque duas marcas nunca podem reivindicar o mesmo
-- alias — o unique index garante isso, uma coluna array não garantiria.
create table brand_aliases (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands(id) on delete cascade,
  alias      text not null,          -- variação encontrada nas lojas, ex: "PAULANER BRAUEREI GRUPPE GMBH & CO. KGAA"
  created_at timestamptz not null default now()
);
create unique index brand_aliases_alias_key on brand_aliases (alias);

alter table brands enable row level security;
alter table brand_aliases enable row level security;

create policy "public read brands" on brands for select using (true);
create policy "public read brand_aliases" on brand_aliases for select using (true);
create policy "auth full brands" on brands for all to authenticated using (true) with check (true);
create policy "auth full brand_aliases" on brand_aliases for all to authenticated using (true) with check (true);
