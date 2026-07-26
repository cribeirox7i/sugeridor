-- Palavras-chave de classificação de categoria (scraper/categorize.py) saem
-- do código pro banco, editável pelo admin (nova aba /admin/classificacao) —
-- antes, adicionar uma palavra nova exigia mudar o scraper. A ORDEM de
-- prioridade das categorias (eventos > kit > copo > souvenirs > cervejas
-- default) continua fixa no código; só a lista de palavras de cada
-- categoria vira dado. 'cervejas' não tem linha aqui — é o fallback quando
-- nenhuma palavra bate.
create table category_keywords (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  keyword text not null,
  created_at timestamptz not null default now(),
  unique (category, keyword)
);

alter table category_keywords enable row level security;

create policy "auth full category_keywords" on category_keywords
  for all to authenticated using (true) with check (true);

-- Seed com as mesmas listas hoje hardcoded em scraper/categorize.py, pra
-- não mudar nenhum comportamento de classificação no dia 1.
insert into category_keywords (category, keyword) values
  ('eventos', 'ingresso'),
  ('eventos', 'convite'),
  ('eventos', 'evento'),
  ('eventos', 'workshop'),
  ('eventos', 'confraria'),
  ('kit', 'kit'),
  ('copo', 'copo'),
  ('copo', 'taça'),
  ('copo', 'caldereta'),
  ('souvenirs', 'camiseta'),
  ('souvenirs', 'camisa'),
  ('souvenirs', 'boné'),
  ('souvenirs', 'chapéu'),
  ('souvenirs', 'broche'),
  ('souvenirs', 'sapato'),
  ('souvenirs', 'chinelo'),
  ('souvenirs', 'caneca'),
  ('souvenirs', 'chaveiro'),
  ('souvenirs', 'adesivo'),
  ('souvenirs', 'squeeze'),
  ('souvenirs', 'moletom'),
  ('souvenirs', 'growler'),
  ('souvenirs', 'abridor'),
  ('souvenirs', 'meia'),
  ('souvenirs', 'sacola'),
  ('souvenirs', 'bag'),
  ('souvenirs', 'ecobag'),
  ('souvenirs', 'canga'),
  ('souvenirs', 'toalha'),
  ('souvenirs', 'bandeira'),
  ('souvenirs', 'balde'),
  ('souvenirs', 'sombrinha'),
  ('souvenirs', 'guarda-sol');
