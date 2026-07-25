-- Categorização de alto nível do produto, independente do product_type
-- (que é sobre o TIPO de bebida/item). Lojas de plataforma (ex: Shopify
-- /products.json, que traz o catálogo inteiro) misturam cerveja com
-- camiseta, ingresso de evento etc. — category deixa filtrar isso.
-- Texto livre (não enum) pra poder crescer sem migração, mesmo espírito de
-- `stores.platform`. Valores usados hoje: 'cervejas', 'souvenirs', 'eventos'.

alter table products add column category text not null default 'cervejas';
create index products_category_idx on products (category);

-- Backfill dos produtos já cadastrados via heurística de palavra-chave no
-- nome. Mesma lista de termos usada por scraper/categorize.py — ajustar as
-- duas juntas se precisar (ver scraper/README.md).
update products set category = 'eventos'
where category = 'cervejas'
  and name ~* '\y(ingresso|convite|evento|workshop|confraria)\y';

update products set category = 'souvenirs'
where category = 'cervejas'
  and name ~* '\y(camiseta|camisa|bon[eé]|caneca|copo|ta[cç]a|chaveiro|adesivo|squeeze|moletom|growler|abridor)\y';
