-- Parâmetro de expiração de ofertas (dias sem ser vista até desativar
-- automaticamente, ver scraper/enrich.py) — editável no admin (Config,
-- ex-Alertas).
alter table site_settings add column offer_expiration_days int not null default 45;

-- Granularidade nova pra 'souvenirs': copo/taça viram categoria própria
-- (ficam armazenados, mas fora da vitrine pública), e 'kit' vira categoria
-- própria que PASSA a aparecer no site junto de 'cervejas' (ver
-- scraper/categorize.py e PUBLIC_CATEGORIES em web/src/lib/queries.ts).
-- Kit primeiro: um produto pode ter "kit" e "copo" no nome ao mesmo tempo
-- (ex: "Kit Copo + Cerveja"), e nesse caso prevalece 'kit' — mesma
-- prioridade do classificador em Python.
update products set category = 'kit'
where category in ('cervejas', 'souvenirs')
  and name ~* '\ykit\y';

update products set category = 'copo'
where category = 'souvenirs'
  and name ~* '\ycopo\y';

update products set category = 'taca'
where category = 'souvenirs'
  and name ~* '\yta[cç]a\y';

-- Padroniza travessão/meia-risca pra hífen simples em texto já gravado
-- (novo texto já sai normalizado — ver scraper/normalize.py e
-- web/src/lib/text.ts).
update products set
  name = replace(replace(name, '—', '-'), '–', '-'),
  brand = replace(replace(brand, '—', '-'), '–', '-')
where name ~ '[—–]' or brand ~ '[—–]';

update stores set
  name = replace(replace(name, '—', '-'), '–', '-'),
  description = replace(replace(description, '—', '-'), '–', '-')
where name ~ '[—–]' or description ~ '[—–]';

-- Títulos em caixa alta (novos produtos do scraper já saem assim — ver
-- pipeline.py).
update products set name = upper(name);
