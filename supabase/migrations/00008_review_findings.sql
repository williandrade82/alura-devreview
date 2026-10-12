-- Achados estruturados de cada revisão (base para detalhes no histórico e estatísticas).
--
--   * review_findings: um registro por achado (severidade, categoria, regra, arquivo/linha...).
--   * review_history ganha commit_sha, pr_title e reviewer (todos opcionais).
--   * A gravação é atômica, feita pela função record_review_with_findings, executável só
--     pela service_role. issues_found é calculado aqui (error + warning), não pelo chamador.
--   * Trecho de código: por padrão NÃO é gravado. Só entra se passar pelos filtros de
--     private.is_snippet_safe; em dúvida, é descartado e o achado fica só com arquivo e linha.

-- ---------------------------------------------------------------------------
-- 1. Novas colunas em review_history
-- ---------------------------------------------------------------------------
alter table review_history
  add column if not exists commit_sha text,
  add column if not exists pr_title   text,
  add column if not exists reviewer   text,
  add constraint review_history_commit_sha_format
    check (commit_sha is null or commit_sha ~ '^[0-9a-f]{7,40}$'),
  add constraint review_history_pr_title_length
    check (pr_title is null or char_length(pr_title) <= 300),
  add constraint review_history_reviewer_length
    check (reviewer is null or char_length(reviewer) <= 100);

-- ---------------------------------------------------------------------------
-- 2. Tabela de achados
-- ---------------------------------------------------------------------------
create table review_findings (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null references review_history(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  severity     text not null check (severity in ('error', 'warning', 'info')),
  category     text not null check (category in ('style', 'architecture', 'security', 'performance')),
  rule_id      uuid references review_rules(id) on delete set null,
  -- Texto da regra no momento da revisão: regras podem ser editadas ou excluídas depois.
  rule_text    text,
  file_path    text,
  line_start   int,
  line_end     int,
  message      text not null,
  suggestion   text,
  code_snippet text,
  status       text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint review_findings_message_length    check (char_length(btrim(message)) between 1 and 500),
  constraint review_findings_suggestion_length check (suggestion is null or char_length(suggestion) <= 1000),
  constraint review_findings_snippet_length    check (code_snippet is null or char_length(code_snippet) <= 600),
  constraint review_findings_file_path_length  check (file_path is null or char_length(file_path) <= 300),
  constraint review_findings_lines_check
    check (
      (line_start is null or line_start >= 1)
      and (line_end is null or (line_start is not null and line_end >= line_start))
    ),
  constraint review_findings_resolved_at_check
    check ((status = 'open') = (resolved_at is null))
);

create index review_findings_review_id_idx       on review_findings (review_id);
create index review_findings_team_created_idx    on review_findings (team_id, created_at desc);
create index review_findings_team_cat_sev_idx    on review_findings (team_id, category, severity);
create index review_findings_rule_id_idx         on review_findings (rule_id) where rule_id is not null;

-- resolved_at é sempre mantido pelo banco (o cliente só altera o status).
create or replace function private.set_finding_resolved_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.resolved_at := case when new.status = 'open' then null else now() end;
  return new;
end;
$$;

create trigger review_findings_resolved_at
  before update of status on review_findings
  for each row execute function private.set_finding_resolved_at();

-- ---------------------------------------------------------------------------
-- 3. RLS: membros leem, líderes mudam o status; ninguém insere pelo cliente
-- ---------------------------------------------------------------------------
alter table review_findings enable row level security;

revoke all on review_findings from anon, authenticated;
grant select on review_findings to authenticated;
grant update (status) on review_findings to authenticated;

create policy "Membros leem achados do time"
  on review_findings for select to authenticated
  using (private.is_team_member(team_id));

create policy "Admin lê achados de todos os times"
  on review_findings for select to authenticated
  using (private.is_platform_admin());

create policy "Líderes atualizam o status dos achados"
  on review_findings for update to authenticated
  using (private.is_team_leader(team_id))
  with check (private.is_team_leader(team_id));

-- ---------------------------------------------------------------------------
-- 4. Filtro de trecho de código
-- ---------------------------------------------------------------------------
-- Retorna true só se o trecho NÃO parece conter dado sensível. É deliberadamente
-- conservador: falso positivo apenas descarta o trecho.
create or replace function private.is_snippet_safe(
  p_snippet   text,
  p_category  text,
  p_file_path text
)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_snippet is not null
    -- achados de segurança são o caso de maior risco: nunca guardam trecho
    and p_category <> 'security'
    -- arquivos que tipicamente guardam segredos
    and coalesce(p_file_path, '') !~* '(^|/)\.env|\.(pem|key|pfx|p12|crt)$|secret|credential|id_rsa'
    -- chaves privadas, chaves de nuvem, JWT, atribuições de segredo e cadeias opacas longas
    and p_snippet !~* '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    and p_snippet !~* '\m(AKIA|ASIA)[0-9A-Z]{16}\M'
    and p_snippet !~* 'eyJ[A-Za-z0-9_-]{10,}\.'
    and p_snippet !~* '(api[_-]?key|secret|token|passw(or)?d|authorization|bearer|credential|service[_-]?key)\s*[:=]'
    and p_snippet !~ '[A-Za-z0-9+/_-]{32,}'
    -- trecho curto: no máximo 12 linhas
    and coalesce(array_length(string_to_array(p_snippet, E'\n'), 1), 0) <= 12;
$$;

-- ---------------------------------------------------------------------------
-- 5. Gravação atômica da revisão com os achados
-- ---------------------------------------------------------------------------
create or replace function public.record_review_with_findings(
  p_team_id        uuid,
  p_pr_url         text,
  p_review_summary text,
  p_commit_sha     text  default null,
  p_pr_title       text  default null,
  p_reviewer       text  default null,
  p_findings       jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_match      text[];
  v_repo       text;
  v_pr_number  int;
  v_review_id  uuid;
  v_reviewed_at timestamptz;
  v_issues     int;
  v_info       int;
  v_omitted    int;
begin
  v_match := regexp_match(
    p_pr_url,
    '^https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/pull/([0-9]+)$'
  );
  if v_match is null then
    raise exception 'URL de PR inválida' using errcode = 'invalid_parameter_value';
  end if;
  v_repo := v_match[1];
  v_pr_number := v_match[2]::int;

  if p_findings is null or jsonb_typeof(p_findings) <> 'array' then
    raise exception 'findings deve ser uma lista' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_findings) > 100 then
    raise exception 'No máximo 100 achados por revisão' using errcode = 'invalid_parameter_value';
  end if;

  -- Toda regra citada precisa pertencer ao time da revisão.
  if exists (
    select 1
    from jsonb_to_recordset(p_findings) as f(rule_id uuid)
    where f.rule_id is not null
      and not exists (
        select 1 from public.review_rules r
        where r.id = f.rule_id and r.team_id = p_team_id
      )
  ) then
    raise exception 'Há achados com rule_id que não pertence ao time'
      using errcode = 'invalid_parameter_value';
  end if;

  select
    count(*) filter (where f.severity in ('error', 'warning')),
    count(*) filter (where f.severity = 'info')
  into v_issues, v_info
  from jsonb_to_recordset(p_findings) as f(severity text);

  insert into public.review_history (
    team_id, pr_url, pr_number, repo, review_summary, issues_found,
    commit_sha, pr_title, reviewer
  )
  values (
    p_team_id, p_pr_url, v_pr_number, v_repo, btrim(p_review_summary), v_issues,
    nullif(btrim(p_commit_sha), ''), nullif(btrim(p_pr_title), ''), nullif(btrim(p_reviewer), '')
  )
  returning id, reviewed_at into v_review_id, v_reviewed_at;

  insert into public.review_findings (
    review_id, team_id, severity, category, rule_id, rule_text,
    file_path, line_start, line_end, message, suggestion, code_snippet
  )
  select
    v_review_id, p_team_id, f.severity, f.category, r.id, r.rule,
    nullif(btrim(f.file_path), ''), f.line_start, f.line_end,
    btrim(f.message), nullif(btrim(f.suggestion), ''),
    case when private.is_snippet_safe(f.code_snippet, f.category, f.file_path)
         then f.code_snippet end
  from jsonb_to_recordset(p_findings) as f(
    severity text, category text, rule_id uuid, file_path text,
    line_start int, line_end int, message text, suggestion text, code_snippet text
  )
  left join public.review_rules r on r.id = f.rule_id;

  select count(*) into v_omitted
  from jsonb_to_recordset(p_findings) as f(
    category text, file_path text, code_snippet text
  )
  where f.code_snippet is not null
    and not private.is_snippet_safe(f.code_snippet, f.category, f.file_path);

  return jsonb_build_object(
    'id', v_review_id,
    'reviewed_at', v_reviewed_at,
    'repo', v_repo,
    'pr_number', v_pr_number,
    'issues_found', v_issues,
    'info_not_counted', v_info,
    'findings_recorded', jsonb_array_length(p_findings),
    'snippets_omitted', v_omitted
  );
end;
$$;

revoke execute on function public.record_review_with_findings(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.record_review_with_findings(uuid, text, text, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. service_role: a gravação passa pela função, então o insert direto sai
-- ---------------------------------------------------------------------------
revoke insert on review_history from service_role;
grant  select on review_findings to service_role;
