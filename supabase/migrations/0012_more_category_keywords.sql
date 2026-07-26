-- Palavras que passaram batido na classificação e apareceram no catálogo real
-- como se fossem cerveja: pôster, pin, tote bag, gorro, corta vento, luminoso.
-- Duas lições registradas aqui:
--   * "moleton" (com N) existia no catálogo mas a lista só tinha "moletom"
--     (com M) — grafia do site não é a do dicionário;
--   * versão com e sem acento ('poster'/'pôster'), porque cada loja escreve
--     como quer e o match é literal por palavra.
-- É seed de CONFIGURAÇÃO (não correção de dado coletado): a partir daqui dá
-- pra adicionar palavra nova pela tela /admin/classificacao, sem migration.
insert into category_keywords (category, keyword) values
  ('souvenirs', 'poster'),
  ('souvenirs', 'pôster'),
  ('souvenirs', 'pin'),
  ('souvenirs', 'tote'),
  ('souvenirs', 'gorro'),
  ('souvenirs', 'corta vento'),
  ('souvenirs', 'luminoso'),
  ('souvenirs', 'moleton'),
  ('souvenirs', 'cartela'),
  ('souvenirs', 'camisa polo'),
  ('eventos', 'vale presente'),
  ('eventos', 'cartão presente'),
  ('eventos', 'cartao presente')
on conflict (category, keyword) do nothing;
