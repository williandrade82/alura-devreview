-- Recomendação de ação do modelo na revisão (modo sombra) e coleta de estatísticas.
--
--   * review_history ganha a recomendação (approve / request_changes / comment), o motivo,
--     a confiança declarada e a flag injection_suspected (suspeita de prompt injection no PR).
--     Nada disso aprova ou bloqueia o PR no GitHub: serve para medir o modelo.
--   * Guardas no banco, que não dependem do prompt: approve é rejeitado se houver achado
--     'error' ou suspeita de manipulação; request_changes exige ao menos um problema.
--   * Desfecho humano (outcome_*): preenchido depois por set_review_outcome a partir do que
--     aconteceu no GitHub (decisão de revisores humanos e estado do PR). É a base da
--     estatística de concordância modelo x humano.
--   * get_team_recommendation_stats: concordância, falsos aprovados e falsos bloqueios.
--
-- ATENÇÃO: record_review_with_findings ganha 4 parâmetros; a versão de 8 parâmetros (00012,
-- com p_keywords) é removida para não haver duas sobrecargas ambíguas na chamada via RPC.
-- A base é a versão da 00012: toda a validação e gravação de palavras-chave é preservada.

-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------
-- Reexecutável: constraints antigas são removidas antes de recriadas.
alter table public.review_history
  drop constraint if exists review_history_recommendation_check,
  drop constraint if exists review_history_recommendation_confidence_check,
  drop constraint if exists review_history_recommendation_reason_length,
  drop constraint if exists review_history_outcome_decision_check,
  drop constraint if exists review_history_outcome_pr_state_check;

alter table public.review_history
  add column if not exists recommendation            text,
  add column if not exists recommendation_reason     text,
  add column if not exists recommendation_confidence text,
  add column if not exists injection_suspected       boolean not null default false,
  add column if not exists outcome_decision          text,
  add column if not exists outcome_pr_state          text,
  add column if not exists outcome_checked_at        timestamptz,
  add constraint review_history_recommendation_check
    check (recommendation is null or recommendation in ('approve', 'request_changes', 'comment')),
  add constraint review_history_recommendation_confidence_check
    check (recommendation_confidence is null or recommendation_confidence in ('low', 'medium', 'high')),
  add constraint review_history_recommendation_reason_length
    check (recommendation_reason is null or char_length(recommendation_reason) <= 500),
  add constraint review_history_outcome_decision_check
    check (outcome_decision is null or outcome_decision in ('approved', 'changes_requested', 'none')),
  add constraint review_history_outcome_pr_state_check
    check (outcome_pr_state is null or outcome_pr_state in ('open', 'closed', 'merged'));

create index if not exists review_history_recommendation_idx
  on public.review_history (team_id, reviewed_at desc) where recommendation is not null;

-- ---------------------------------------------------------------------------
-- 2. Gravação (substitui a função de 7 parâmetros)
-- ---------------------------------------------------------------------------
drop function if exists public.record_review_with_findings(uuid, text, text, text, text, text, jsonb, jsonb);
-- Versão intermediária (recomendação sem p_keywords), se tiver sido aplicada antes.
drop function if exists public.record_review_with_findings(uuid, text, text, text, text, text, jsonb, text, text, text, boolean);

create or replace function public.record_review_with_findings(
  p_team_id             uuid,
  p_pr_url              text,
  p_review_summary      text,
  p_commit_sha          text    default null,
  p_pr_title            text    default null,
  p_reviewer            text    default null,
  p_findings            jsonb   default '[]'::jsonb,
  p_keywords            jsonb   default '[]'::jsonb,
  p_recommendation      text    default null,
  p_recommendation_reason text  default null,
  p_confidence          text    default null,
  p_injection_suspected boolean default false
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
  v_errors     int;
  v_info       int;
  v_omitted    int;
  v_redacted   int := 0;
  v_summary    text := btrim(p_review_summary);
  v_pr_title   text := nullif(btrim(p_pr_title), '');
  v_reason     text := nullif(btrim(p_recommendation_reason), '');
  v_injection  boolean := coalesce(p_injection_suspected, false);
  v_redacted_findings int;
  v_elem       jsonb;
  v_kw         text;
  v_kw_count   int;
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

  -- Palavras-chave: validadas antes de gravar qualquer coisa.
  if p_keywords is null or jsonb_typeof(p_keywords) <> 'array' then
    raise exception 'keywords deve ser uma lista' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_keywords) > 5 then
    raise exception 'No máximo 5 palavras-chave por revisão' using errcode = 'invalid_parameter_value';
  end if;
  for v_elem in select e.value from jsonb_array_elements(p_keywords) as e loop
    if jsonb_typeof(v_elem) <> 'object'
       or jsonb_typeof(v_elem -> 'keyword') is distinct from 'string'
       or jsonb_typeof(v_elem -> 'severity') is distinct from 'string' then
      raise exception 'Cada palavra-chave deve ter keyword e severity (texto)'
        using errcode = 'invalid_parameter_value';
    end if;
    v_kw := btrim(regexp_replace(v_elem ->> 'keyword', '\s+', ' ', 'g'));
    if char_length(v_kw) not between 2 and 40
       or array_length(string_to_array(v_kw, ' '), 1) > 3
       or v_kw !~ '^[[:alnum:]][[:alnum:] ./+#_-]*$' then
      raise exception 'Palavra-chave inválida (%): use de 1 a 3 palavras, de 2 a 40 caracteres', v_kw
        using errcode = 'invalid_parameter_value';
    end if;
    if private.contains_secret(v_kw) then
      raise exception 'Palavra-chave com aparência de dado sensível' using errcode = 'invalid_parameter_value';
    end if;
    if (v_elem ->> 'severity') not in ('error', 'warning', 'info') then
      raise exception 'Severidade da palavra-chave deve ser error, warning ou info'
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

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
    count(*) filter (where f.severity = 'error'),
    count(*) filter (where f.severity = 'info')
  into v_issues, v_errors, v_info
  from jsonb_to_recordset(p_findings) as f(severity text);

  -- Recomendação: coerente com os achados, para não depender só do prompt.
  if p_recommendation is null then
    if v_reason is not null or p_confidence is not null or v_injection then
      raise exception 'Motivo, confiança e suspeita de manipulação exigem a recomendação'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    if p_recommendation not in ('approve', 'request_changes', 'comment') then
      raise exception 'Recomendação deve ser approve, request_changes ou comment'
        using errcode = 'invalid_parameter_value';
    end if;
    if p_confidence is not null and p_confidence not in ('low', 'medium', 'high') then
      raise exception 'Confiança deve ser low, medium ou high'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_reason is null then
      raise exception 'Informe o motivo da recomendação' using errcode = 'invalid_parameter_value';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'Motivo da recomendação com no máximo 500 caracteres'
        using errcode = 'invalid_parameter_value';
    end if;
    if p_recommendation = 'approve' and v_errors > 0 then
      raise exception 'Não é possível recomendar approve com achados de severidade error'
        using errcode = 'invalid_parameter_value';
    end if;
    if p_recommendation = 'approve' and v_injection then
      raise exception 'Não é possível recomendar approve com suspeita de manipulação (prompt injection)'
        using errcode = 'invalid_parameter_value';
    end if;
    if p_recommendation = 'request_changes' and v_issues = 0 then
      raise exception 'request_changes exige ao menos um achado de severidade error ou warning'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- Campos de texto do cabeçalho da revisão.
  if private.contains_secret(v_summary) then
    v_summary := c_redacted;
    v_redacted := v_redacted + 1;
  end if;
  if private.contains_secret(v_pr_title) then
    v_pr_title := c_redacted;
    v_redacted := v_redacted + 1;
  end if;
  if private.contains_secret(v_reason) then
    v_reason := c_redacted;
    v_redacted := v_redacted + 1;
  end if;

  insert into public.review_history (
    team_id, pr_url, pr_number, repo, review_summary, issues_found,
    commit_sha, pr_title, reviewer,
    recommendation, recommendation_reason, recommendation_confidence, injection_suspected
  )
  values (
    p_team_id, p_pr_url, v_pr_number, v_repo, v_summary, v_issues,
    nullif(btrim(p_commit_sha), ''), v_pr_title, nullif(btrim(p_reviewer), ''),
    p_recommendation, v_reason, p_confidence, v_injection
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

  -- Palavras repetidas (mesma forma normalizada) viram uma só, com a maior severidade.
  insert into public.review_keywords (
    review_id, team_id, keyword, keyword_key, severity, position, reviewed_at
  )
  select
    v_review_id, p_team_id, d.kw, d.kw_key, d.sev,
    (row_number() over (order by d.ord))::smallint, v_reviewed_at
  from (
    select distinct on (n.kw_key) n.kw, n.kw_key, n.sev, n.ord
    from (
      select
        btrim(regexp_replace(e.value ->> 'keyword', '\s+', ' ', 'g')) as kw,
        private.normalize_keyword(e.value ->> 'keyword') as kw_key,
        e.value ->> 'severity' as sev,
        e.ord
      from jsonb_array_elements(p_keywords) with ordinality as e(value, ord)
    ) n
    order by n.kw_key,
      case n.sev when 'error' then 0 when 'warning' then 1 else 2 end,
      n.ord
  ) d;
  get diagnostics v_kw_count = row_count;

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
    'text_redacted', v_redacted,
    'keywords_recorded', v_kw_count,
    'recommendation', p_recommendation
  );
end;
$$;

revoke execute on function public.record_review_with_findings(uuid, text, text, text, text, text, jsonb, jsonb, text, text, text, boolean)
  from public, anon, authenticated;
grant  execute on function public.record_review_with_findings(uuid, text, text, text, text, text, jsonb, jsonb, text, text, text, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Desfecho humano (a service_role não tem update em review_history)
-- ---------------------------------------------------------------------------
create or replace function public.set_review_outcome(
  p_review_id uuid,
  p_decision  text,
  p_pr_state  text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_decision not in ('approved', 'changes_requested', 'none') then
    raise exception 'Decisão deve ser approved, changes_requested ou none'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_pr_state not in ('open', 'closed', 'merged') then
    raise exception 'Estado do PR deve ser open, closed ou merged'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.review_history
  set outcome_decision = p_decision,
      outcome_pr_state = p_pr_state,
      outcome_checked_at = now()
  where id = p_review_id and recommendation is not null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function public.set_review_outcome(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.set_review_outcome(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Estatísticas de recomendação do time (usado pela tool get_recommendation_stats)
--    Concordância: approve x approved e request_changes x changes_requested.
--    Só revisões com desfecho humano decisivo (approved/changes_requested) entram na taxa.
-- ---------------------------------------------------------------------------
create or replace function public.get_team_recommendation_stats(
  p_team_id uuid,
  p_since   timestamptz
)
returns jsonb
language sql stable set search_path = ''
as $$
  with r as (
    select
      recommendation,
      coalesce(recommendation_confidence, 'unspecified') as confidence,
      injection_suspected,
      outcome_decision,
      outcome_decision in ('approved', 'changes_requested') as decided,
      (recommendation = 'approve' and outcome_decision = 'approved')
        or (recommendation = 'request_changes' and outcome_decision = 'changes_requested') as agree
    from public.review_history
    where team_id = p_team_id and reviewed_at >= p_since and recommendation is not null
  )
  select jsonb_build_object(
    'total', count(*),
    'with_human_outcome', count(*) filter (where decided),
    'injection_suspected', count(*) filter (where injection_suspected),
    'by_recommendation', jsonb_build_object(
      'approve',         count(*) filter (where recommendation = 'approve'),
      'request_changes', count(*) filter (where recommendation = 'request_changes'),
      'comment',         count(*) filter (where recommendation = 'comment')
    ),
    'agreement', jsonb_build_object(
      'agree',         count(*) filter (where agree),
      'false_approve', count(*) filter (where recommendation = 'approve' and outcome_decision = 'changes_requested'),
      'false_block',   count(*) filter (where recommendation = 'request_changes' and outcome_decision = 'approved'),
      'comment_with_outcome', count(*) filter (where recommendation = 'comment' and decided)
    ),
    'by_confidence', (
      select coalesce(jsonb_agg(c order by c.confidence), '[]'::jsonb)
      from (
        select
          confidence,
          count(*)                       as total,
          count(*) filter (where decided) as with_human_outcome,
          count(*) filter (where agree)   as agree
        from r
        group by confidence
      ) c
    )
  )
  from r;
$$;

revoke execute on function public.get_team_recommendation_stats(uuid, timestamptz)
  from public, anon, authenticated;
grant  execute on function public.get_team_recommendation_stats(uuid, timestamptz) to service_role;
