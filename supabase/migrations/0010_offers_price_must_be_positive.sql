-- scraper/pipeline.py já descarta candidatos com preço <= 0 antes de
-- gravar, mas mesmo assim apareceram ofertas com preço 0 no banco
-- (provavelmente de uma execução anterior ao fix entrar no ar). Em vez de
-- confiar só na aplicação, um constraint garante isso na origem — nenhum
-- caminho de código (scraper, cadastro manual, o que vier depois) consegue
-- mais gravar preço inválido, mesmo que esqueça de checar.

-- Limpa o que já está gravado errado. price_history primeiro e à parte:
-- existem pontos de histórico com preço <= 0 presos a ofertas cujo preço
-- ATUAL já é válido (a queda pra 0 foi só um instante do passado) — a
-- cascata de deletar a oferta não pegaria esses.
delete from price_history where price <= 0;
delete from offers where price <= 0;

alter table offers add constraint offers_price_positive check (price > 0);
alter table price_history add constraint price_history_price_positive check (price > 0);
