-- Referência a ADR nos achados da revisão.
--
--   * review_findings.adr_id: ADR do time que embasa o achado (opcional), com adr_title
--     guardando o título na época (como rule_text), pois o ADR pode ser editado ou excluído.
--   * record_review_with_findings valida que todo adr_id pertence ao time da revisão
--     (mesma regra já aplicada ao rule_id) e grava adr_id e adr_title.

alter table review_findings
  add column if not exists adr_id    uuid references adrs(id) on delete set null,
  add column if not exists adr_title text,
  add constraint review_findings_adr_title_length
    check (adr_title is null or char_length(adr_title) <= 200);

create index if not exists review_findings_adr_id_idx
  on review_findings (adr_id) where adr_id is not null;

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
  c_redacted   constant text := '[conteúdo omitido: possível dado sensível]';
  v_match      text[];
  v_repo       text;
  v_pr_number  int;
  v_review_id  uuid;
  v_reviewed_at timestamptz;
  v_issues     int;
  v_info       int;
  v_omitted    int;
  v_redacted   int := 0;
  v_summary    text := btrim(p_review_summary);
  v_pr_title   text := nullif(btrim(p_pr_title), '');
  v_redacted_findings int;
begin
  v_match := regexp_match(
    p_pr_url,
    '^https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/pull/([0-9]+)$'
  );
  if v_match is null then
    raise exception 'URL de PR inválida' using errcode = 'invalid_parameter_value';
  end if;
  v_repo := v_match[1];

  -- numeric não estoura com qualquer quantidade de dígitos; só depois cabe no int.
  if v_match[2]::numeric > 2147483647 then
    raise exception 'Número do PR fora do intervalo permitido' using errcode = 'invalid_parameter_value';
  end if;
  v_pr_number := v_match[2]::int;
  if v_pr_number < 1 then
    raise exception 'Número do PR deve ser maior que zero' using errcode = 'invalid_parameter_value';
  end if;

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

  -- Todo ADR citado também precisa pertencer ao time da revisão.
  if exists (
    select 1
    from jsonb_to_recordset(p_findings) as f(adr_id uuid)
    where f.adr_id is not null
      and not exists (
        select 1 from public.adrs a
        where a.id = f.adr_id and a.team_id = p_team_id
      )
  ) then
    raise exception 'Há achados com adr_id que não pertence ao time'
      using errcode = 'invalid_parameter_value';
  end if;

  select
    count(*) filter (where f.severity in ('error', 'warning')),
    count(*) filter (where f.severity = 'info')
  into v_issues, v_info
  from jsonb_to_recordset(p_findings) as f(severity text);

  -- Campos de texto do cabeçalho da revisão.
  if private.contains_secret(v_summary) then
    v_summary := c_redacted;
    v_redacted := v_redacted + 1;
  end if;
  if private.contains_secret(v_pr_title) then
    v_pr_title := c_redacted;
    v_redacted := v_redacted + 1;
  end if;

  insert into public.review_history (
    team_id, pr_url, pr_number, repo, review_summary, issues_found,
    commit_sha, pr_title, reviewer
  )
  values (
    p_team_id, p_pr_url, v_pr_number, v_repo, v_summary, v_issues,
    nullif(btrim(p_commit_sha), ''), v_pr_title, nullif(btrim(p_reviewer), '')
  )
  returning id, reviewed_at into v_review_id, v_reviewed_at;

  insert into public.review_findings (
    review_id, team_id, severity, category, rule_id, rule_text, adr_id, adr_title,
    file_path, line_start, line_end, message, suggestion, code_snippet
  )
  select
    v_review_id, p_team_id, f.severity, f.category, r.id, r.rule, a.id, a.title,
    nullif(btrim(f.file_path), ''), f.line_start, f.line_end,
    case when private.contains_secret(f.message) then c_redacted else btrim(f.message) end,
    case when private.contains_secret(f.suggestion) then null else nullif(btrim(f.suggestion), '') end,
    case when private.is_snippet_safe(f.code_snippet, f.category, f.file_path)
         then f.code_snippet end
  from jsonb_to_recordset(p_findings) as f(
    severity text, category text, rule_id uuid, adr_id uuid, file_path text,
    line_start int, line_end int, message text, suggestion text, code_snippet text
  )
  left join public.review_rules r on r.id = f.rule_id
  left join public.adrs a on a.id = f.adr_id;

  select count(*) into v_redacted_findings
  from jsonb_to_recordset(p_findings) as f(message text, suggestion text)
  where private.contains_secret(f.message) or private.contains_secret(f.suggestion);
  v_redacted := v_redacted + v_redacted_findings;

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
    'snippets_omitted', v_omitted,
    'text_redacted', v_redacted
  );
end;
$$;

-- create or replace preserva os grants anteriores; reafirmados por clareza.
revoke execute on function public.record_review_with_findings(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.record_review_with_findings(uuid, text, text, text, text, text, jsonb)
  to service_role;
