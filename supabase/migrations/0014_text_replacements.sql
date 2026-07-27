-- Regras de substituição de/para aplicadas em lote sobre nome e marca dos
-- produtos já cadastrados (tela /admin/ferramentas).
--
-- Motivação concreta: os coletores gravam o que a loja escreve, e isso vem
-- torto de duas formas que nenhuma regra fixa no código resolve bem:
--
--   * `clean_product_name` remove o prefixo "Cerveja ", então "Cerveja Alemã
--     Paulaner Münchner Hell 330ml" fica "Alemã Paulaner Münchner Hell 330ml"
--     — o adjetivo sozinho não faz sentido. São 58 produtos assim hoje, com
--     variações (Alemã, Brasileira, Belga...), e a lista nunca estaria
--     completa no código.
--   * a marca vem em formatos incompatíveis entre lojas: "PAULANER BRAUEREI
--     GRUPPE GMBH & CO KGAA" numa e "Paulaner" noutra, "dogmacervejaria" vs
--     "Cervejaria Dogma". Como `canonical_slug` = slugify(marca + nome), isso
--     faz o MESMO produto virar dois — que é a causa de as ofertas de lojas
--     diferentes não agregarem numa página só.
--
-- Por isso `target`: a mesma ferramenta corrige nome e marca. Mesmo padrão de
-- `category_keywords` (migration 0011): tabela editável pelo admin em vez de
-- lista hardcoded. Sem seed — as regras são do usuário.
create table text_replacements (
  id         uuid primary key default gen_random_uuid(),
  target     text not null check (target in ('name', 'brand')),
  search     text not null,
  replace    text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (target, search)
);

comment on table text_replacements is
  'Regras de/para aplicadas sob demanda (nunca na coleta) em products.name e products.brand pela tela /admin/ferramentas. replace vazio = remove o trecho.';

alter table text_replacements enable row level security;

create policy "auth full text_replacements" on text_replacements
  for all to authenticated using (true) with check (true);
