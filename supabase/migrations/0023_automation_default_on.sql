-- A automação pós-coleta (de/para + mesclagem, migration 0018) nascia
-- desligada por padrão — exigia que o usuário fosse em /admin/config e
-- ligasse os dois toggles antes de qualquer coleta se beneficiar disso. Na
-- prática isso significava aplicar regra por regra à mão depois de toda
-- coleta, exatamente o trabalho manual que a automação existe pra evitar.
--
-- Muda o padrão pra ligado — o usuário pode desligar de volta em
-- /admin/config a qualquer momento. Só toma efeito de fato se
-- SITE_BASE_URL/AUTOMATION_TOKEN (secrets do GitHub) e
-- AUTOMATION_TOKEN/SUPABASE_SERVICE_ROLE_KEY (env do Vercel) também
-- estiverem configurados — sem eles o passo do workflow continua só
-- avisando e não rodando nada (ver .github/workflows/scrape.yml).
alter table site_settings alter column auto_apply_replacements set default true;
alter table site_settings alter column auto_merge_duplicates set default true;

update site_settings set auto_apply_replacements = true, auto_merge_duplicates = true where id = 1;
