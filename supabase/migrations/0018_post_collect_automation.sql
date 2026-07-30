-- Automação pós-coleta (aplicar de/para + mesclar duplicatas sozinho, ver
-- docs/04-conectores-ingestao.md) e loja própria como tipo padrão no cadastro
-- (a maioria das lojas cadastradas até aqui é própria, não marketplace).

alter table site_settings add column auto_apply_replacements boolean not null default false;
alter table site_settings add column auto_merge_duplicates boolean not null default false;

alter table stores alter column store_type set default 'propria';
