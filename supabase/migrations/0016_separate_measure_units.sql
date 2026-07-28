-- Separa a unidade de medida do número no nome do produto: "500ml" -> "500 ml".
--
-- Motivação: cada loja escreve como quer ("500ml", "500 ML", "330Ml") e o
-- coletor gravava literalmente. Isso deixava o nome ilegível no card e, pior,
-- fazia o MESMO volume escrito de duas formas virar dois produtos — o
-- `canonical_slug` deriva do nome, então "Erdinger Urweisse500ml" e "Erdinger
-- Urweisse 500ml" são registros distintos que nunca agregam ofertas. Eram 901
-- de 1497 produtos com a unidade colada e outros 17 com "Ml" (o Title Case
-- capitalizava a unidade, que `separate_units` agora solta como palavra).
--
-- A regra vive no código, espelhada nos dois lados
-- (scraper/normalize.py::separate_units e web/src/lib/text.ts::separateUnits),
-- pra a coleta seguinte calcular o mesmo nome e o mesmo slug. Esta migration é
-- só o backfill do que já está gravado — sem ela o site continuaria mostrando
-- os nomes antigos; sem o código, a coleta seguinte recriaria tudo colado.
--
-- Unidades e forma canônica (iguais ao _UNIT_CANONICAL do código): ml, cl, dl,
-- kg, g, oz minúsculos e o litro como 'L' maiúsculo (o minúsculo se confunde
-- com o dígito 1).
--
-- Os regexps daqui foram conferidos contra os 1497 nomes reais do catálogo,
-- simulando cada substituição e comparando com o resultado de
-- separateUnits()/slugify() — zero divergência. O botão "Normalizar nomes" em
-- /admin/produtos (ou /admin/ferramentas) faz o MESMO backfill chamando as
-- funções de verdade em vez de regexp, e recalcula o slug por productSlug; é
-- equivalente e serve para quem preferir não rodar SQL à mão. Rodar os dois não
-- causa problema (ambos são idempotentes).

-- ── 1a. Palavra colada na medida ──────────────────────────────────
-- "Erdinger Urweisse500ml" -> "Erdinger Urweisse 500ml". Separado do passo
-- seguinte porque é outro problema: aqui o número está colado na PALAVRA. Só
-- corta quando os dígitos são de fato uma medida (a unidade tem que vir
-- depois), senão "Abt 12" e "Kasteel 4+1" seriam picados sem motivo. Também é
-- o que devolve a sigla de estilo ao Title Case: "IPA355ml" é uma palavra só e
-- virava "Ipa355ml".
update products
   set name = regexp_replace(
     name,
     '([[:alpha:]])([0-9]+([.,][0-9]+)?[ \t]*(ml|cl|dl|kg|oz|l|g)\M)',
     '\1 \2',
     'gi'
   )
 where name ~* '[[:alpha:]][0-9]+([.,][0-9]+)?[ \t]*(ml|cl|dl|kg|oz|l|g)\M';

-- ── 1b. Unidade colada no número ──────────────────────────────────
-- Uma passada por unidade porque regexp_replace não sabe minusculizar a
-- referência ao grupo capturado — escrever a unidade literalmente na
-- substituição é o que normaliza a caixa ("330Ml" e "330 ML" viram "330 ml").
-- `\M` é fim-de-palavra no regex do Postgres: impede casar dentro de outra
-- palavra ("500mlx" não é volume). O dígito antes é o que impede casar a letra
-- final de uma palavra qualquer, e é por ele que "500kg" não casa na regra do
-- 'g' (antes do 'g' vem 'k', não um dígito).
update products set name = regexp_replace(name, '([0-9])[ \t]*ml\M', '\1 ml', 'gi')
  where name ~* '[0-9][ \t]*ml\M';
update products set name = regexp_replace(name, '([0-9])[ \t]*cl\M', '\1 cl', 'gi')
  where name ~* '[0-9][ \t]*cl\M';
update products set name = regexp_replace(name, '([0-9])[ \t]*dl\M', '\1 dl', 'gi')
  where name ~* '[0-9][ \t]*dl\M';
update products set name = regexp_replace(name, '([0-9])[ \t]*kg\M', '\1 kg', 'gi')
  where name ~* '[0-9][ \t]*kg\M';
update products set name = regexp_replace(name, '([0-9])[ \t]*oz\M', '\1 oz', 'gi')
  where name ~* '[0-9][ \t]*oz\M';
update products set name = regexp_replace(name, '([0-9])[ \t]*l\M', '\1 L', 'gi')
  where name ~* '[0-9][ \t]*l\M';
update products set name = regexp_replace(name, '([0-9])[ \t]*g\M', '\1 g', 'gi')
  where name ~* '[0-9][ \t]*g\M';

-- Espaço duplo pode sobrar se a fonte já tinha espaço antes da unidade.
update products set name = btrim(regexp_replace(name, '[ \t]{2,}', ' ', 'g'))
  where name ~ '[ \t]{2,}' or name <> btrim(name);

-- ── 2. Identificador (canonical_slug) ─────────────────────────────
-- O slug é a chave pela qual o coletor reconhece um produto existente. Como
-- ele é slugify(nome), os dois cortes do passo 1 mudam o slug de
-- "urweisse500ml" pra "urweisse-500-ml": aplicar as mesmas duas separações
-- aqui é equivalente a recalcular (cada espaço que entrou no nome viraria
-- exatamente um desses hífens), e evita reimplementar em SQL a regra de
-- marca-no-nome de productSlug. A equivalência foi conferida contra os 1497
-- nomes reais do catálogo, comparando este regexp com slugify(separateUnits()).
--
-- Colisões ficam de fora, nunca são mescladas automaticamente: dois produtos
-- convergindo pro mesmo slug significa "é o mesmo produto cadastrado duas
-- vezes", e resolver isso move ofertas e apaga um registro. A tela
-- /admin/ferramentas lista esses casos com botão de mesclar (individual ou em
-- lote). Enquanto não forem mesclados, o nome fica ajustado e o slug fica no
-- formato antigo — o que faz a coleta seguinte criar a duplicata explicitamente
-- em vez de esconder o problema.
with novo as (
  select
    id,
    canonical_slug as antigo,
    -- Mesma ordem do código: primeiro palavra↔número, depois número↔unidade.
    -- O hífen opcional no meio cobre o slug de um nome que já tinha espaço
    -- entre número e unidade mas não entre palavra e número ("urweisse500-ml").
    regexp_replace(
      regexp_replace(
        canonical_slug,
        '([a-z])([0-9]+-?(ml|cl|dl|kg|oz|l|g)(-|$))',
        '\1-\2',
        'g'
      ),
      '([0-9])(ml|cl|dl|kg|oz|l|g)(-|$)',
      '\1-\2\3',
      'g'
    ) as slug
  from products
),
mudou as (
  select * from novo where slug <> antigo
),
-- Quantos produtos reivindicariam cada slug novo (colisão dentro do lote).
disputa as (
  select slug, count(*) as quantos from mudou group by slug
),
seguro as (
  select m.id, m.slug
  from mudou m
  join disputa d on d.slug = m.slug
  where d.quantos = 1
    -- colisão com produto que não está mudando
    and not exists (
      select 1 from products p where p.canonical_slug = m.slug and p.id <> m.id
    )
)
update products p
   set canonical_slug = s.slug,
       updated_at = now()
  from seguro s
 where p.id = s.id;

-- ── 3. O que sobrou ───────────────────────────────────────────────
-- Lista os produtos cujo slug NÃO pôde ser ajustado por colisão. Cada linha é
-- uma duplicata a mesclar em /admin/ferramentas → "Duplicatas por nome".
-- Resultado vazio = catálogo inteiro sincronizado com a fórmula da coleta.
with alvo as (
  select
    id, name, brand, canonical_slug,
    regexp_replace(
      regexp_replace(canonical_slug, '([a-z])([0-9]+-?(ml|cl|dl|kg|oz|l|g)(-|$))', '\1-\2', 'g'),
      '([0-9])(ml|cl|dl|kg|oz|l|g)(-|$)', '\1-\2\3', 'g'
    ) as slug_desejado
  from products
)
select id, name, brand, canonical_slug as slug_atual, slug_desejado
from alvo
where slug_desejado <> canonical_slug
order by name;
