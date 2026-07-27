-- Apelido da loja usado como MARCA dos produtos dela.
--
-- Motivação: o nome de um produto é marca + descritivo. "IPA" sozinho não
-- identifica nada — o produto é "Dogma IPA", como "Fanta Laranja" não é só
-- "Laranja". As lojas próprias não repetem a própria marca no nome do produto
-- (óbvio para quem navega no site delas, inútil num agregador), então o
-- scraper passa a prefixar.
--
-- Só que o nome da loja costuma ser longo demais para virar prefixo:
-- "Cervejaria Dogma IPA" e "Japas Cervejaria Kasato Maru" ficam pesados. O
-- apelido é a forma curta ("Dogma", "Japas") usada tanto como marca gravada
-- quanto como prefixo do nome.
--
-- NULL = usa `stores.name`, então nada muda para quem não preencher.
alter table stores add column brand_alias text;

comment on column stores.brand_alias is
  'Forma curta do nome da loja, usada como products.brand e como prefixo do nome do produto nas lojas store_type = propria. NULL = usa stores.name.';
