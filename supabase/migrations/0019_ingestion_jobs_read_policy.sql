-- Bug real, presente desde a migration 0001: `ingestion_jobs` tem RLS
-- habilitado mas nunca recebeu uma policy pro role `authenticated` — só o
-- service_role (usado pelo scraper) tinha acesso. A tela de histórico de
-- execuções em /admin/lojas lê essa tabela pelo cliente de sessão do admin
-- (anon key + cookie), então sempre devolveu 0 linhas em silêncio, mesmo com
-- coletas rodando com sucesso.
--
-- Só leitura: quem GRAVA continua sendo só o scraper via service_role (a
-- tabela é um log de execução, o admin não cria/edita linha nela).
create policy "auth read ingestion_jobs" on ingestion_jobs
  for select to authenticated using (true);
