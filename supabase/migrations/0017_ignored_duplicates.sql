-- Pares de produtos que o admin decidiu NÃO mesclar.
--
-- Motivação: a tela /admin/ferramentas detecta duplicatas (mesmo nome com
-- identificador diferente, ou nomes que colidiriam depois das substituições de
-- de/para) e oferece "Mesclar". Só que nem toda coincidência é duplicata de
-- verdade, e até agora a única saída era mesclar — a decisão de ignorar vivia
-- apenas no estado da tela e voltava a aparecer no recarregamento seguinte.
-- Eram 27 grupos reaparecendo em cada visita.
--
-- Ignorar também é mais barato que mesclar: mesclar move ofertas, apaga
-- produto e mexe em várias linhas; ignorar grava uma. Os dois produtos seguem
-- separados e o coletor continua gravando ponto em `price_history` apenas
-- quando o preço MUDA (ver scraper/pipeline.py) — nenhuma escrita a mais por
-- causa disto.
create table ignored_duplicates (
  id            uuid primary key default gen_random_uuid(),
  product_a_id  uuid not null references products (id) on delete cascade,
  product_b_id  uuid not null references products (id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- Par CANÔNICO (a < b): sem isto o mesmo par entraria duas vezes, invertido,
  -- e o `unique` não impediria nada. O código ordena os dois ids antes de
  -- inserir; o check é a rede de segurança no banco.
  constraint ignored_duplicates_canonical check (product_a_id < product_b_id),
  unique (product_a_id, product_b_id)
);

comment on table ignored_duplicates is
  'Pares de produtos marcados como "não são duplicata" em /admin/ferramentas. Par sempre canônico (product_a_id < product_b_id). ON DELETE CASCADE: se um dos produtos for apagado (mesclado por outro caminho), a linha sai sozinha.';

-- Consulta da tela: dado o conjunto de produtos, quais pares estão ignorados.
create index ignored_duplicates_a_idx on ignored_duplicates (product_a_id);
create index ignored_duplicates_b_idx on ignored_duplicates (product_b_id);

alter table ignored_duplicates enable row level security;

-- Mesma política de `text_replacements` (migration 0014): é dado só do admin,
-- o site público não lê nem escreve isto.
create policy "auth full ignored_duplicates" on ignored_duplicates
  for all to authenticated using (true) with check (true);
