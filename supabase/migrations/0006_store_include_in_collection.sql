-- Checkbox de "incluir na coleta" por loja (tela /admin/coleta). Default
-- true: loja nova (com ou sem platform) já nasce marcada; só passa a
-- importar de fato quando platform também estiver definido (ver run.py).

alter table stores add column include_in_collection boolean not null default true;
