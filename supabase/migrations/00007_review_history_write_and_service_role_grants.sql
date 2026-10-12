-- Registro de revisões pelo MCP server (tool record_review) com privilégio mínimo.
--
-- O MCP server usa a service key (role service_role, que ignora o RLS, mas NÃO ignora
-- GRANT). Ele precisa apenas de:
--   * select em teams, review_rules, adrs e review_history (tools de consulta);
--   * insert em review_history (tool record_review).
-- Nada de update/delete: o histórico é só de acréscimo.

-- ---------------------------------------------------------------------------
-- 1. Validação dos dados gravados no histórico
-- ---------------------------------------------------------------------------
alter table review_history
  add constraint review_history_issues_found_check check (issues_found >= 0),
  add constraint review_history_pr_number_check check (pr_number > 0),
  add constraint review_history_summary_length
    check (review_summary is null or char_length(review_summary) <= 2000),
  add constraint review_history_pr_url_format
    check (pr_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$');

-- Consulta das métricas: filtra por time e período.
create index if not exists review_history_team_reviewed_at_idx
  on review_history (team_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- 2. Privilégios mínimos da service_role
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from service_role;

grant select on teams, review_rules, adrs, review_history to service_role;
grant insert on review_history to service_role;

-- Tabelas criadas no futuro não ganham acesso automático da service_role:
-- cada nova tabela precisa de um GRANT explícito.
alter default privileges for role postgres in schema public
  revoke all on tables from service_role;
