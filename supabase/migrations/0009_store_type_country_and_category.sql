-- Tipo de loja (marketplace revende várias marcas; "própria" é a loja de
-- uma cervejaria vendendo o produto dela mesma) e país padrão da loja —
-- usados pelo scraper (scraper/enrich.py) pra preencher marca/país dos
-- produtos que vieram sem essa informação, só pra lojas "própria" (um
-- marketplace não deve emprestar seu país/nome pros produtos de terceiros
-- que revende).
alter table stores add column store_type text not null default 'marketplace';
alter table stores add column country text not null default 'Brasil';

-- 'taca' deixa de ser categoria própria — copo/taça/caldereta viram uma
-- categoria só ('copo'), pedido do usuário.
update products set category = 'copo' where category = 'taca';

update products set category = 'copo'
where category = 'cervejas'
  and name ~* '\y(copo|ta[cç]a|caldereta)\y';

-- Lista de palavras de SOUVENIR ampliada (mesma lista em
-- scraper/categorize.py — manter as duas em sincronia).
update products set category = 'souvenirs'
where category = 'cervejas'
  and (
    name ~* '\y(camiseta|camisa|bon[eé]|chap[eé]u|broche|sapato|chinelo|chaveiro|adesivo|squeeze|moletom|growler|abridor|meia|sacola|bag|ecobag|canga|toalha|bandeira|balde|sombrinha)\y'
    or name ~* 'guarda[[:space:]-]?sol'
  );
