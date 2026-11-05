-- match_key: identidade de AGRUPAMENTO do produto, separada do canonical_slug.
--
-- O problema que isto resolve: o agrupamento de ofertas era 100% match exato de
-- canonical_slug (= slugify(marca + nome)). Num agregador cada loja escreve o
-- mesmo produto de um jeito — "Garrafa"/"Lata", prefixo "Belga"/"Alemã", ordem
-- das palavras, marca cervejaria vs rótulo (Huyghe vs Delirium) — então o mesmo
-- produto virava vários produtos, cada um como um card no site (visto na
-- prática com o Delirium Nocturnum: 5 cards). A match_key é uma chave
-- normalizada (tira embalagem/descritor, ordena os tokens, usa o volume como
-- discriminador) que colapsa essas variações. Dry-run contra o catálogo real
-- (2026-11-05): 2917 -> 2514 produtos.
--
-- A regra vive no código, espelhada nos dois lados
-- (scraper/normalize.py::match_key e web/src/lib/slug.ts::matchKey). Esta
-- migration só cria a coluna; quem preenche é o botão "Recalcular agrupamento"
-- em /admin/ferramentas (backfill via as funções de verdade) e a própria
-- coleta, que daí em diante reconhece um produto existente pela match_key.
--
-- NÃO é unique de propósito: enquanto as duplicatas atuais não forem mescladas
-- na tela de revisão, várias linhas compartilham a mesma match_key — é o
-- esperado, e é o que a lista "Duplicatas (mesmo produto)" mostra pra mesclar.
-- O canonical_slug continua sendo a URL única do produto, intocado.

alter table products add column if not exists match_key text;

create index if not exists products_match_key_idx on products (match_key);
