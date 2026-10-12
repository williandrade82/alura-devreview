-- Palavras-chave das revisões (assuntos analisados), base das estatísticas por tema.
--
--   * review_keywords: até 5 palavras por revisão (1 a 3 palavras, até 40 caracteres), cada uma
--     com severidade (error/warning/info), posição (1 = principal) e reviewed_at copiado da
--     revisão, para consultar a evolução no tempo sem juntar com review_history.
--   * keyword_key: forma normalizada (minúsculas, sem acento, espaços colapsados) usada para
--     agrupar variações da mesma palavra nas estatísticas.
--   * A gravação é feita por record_review_with_findings, na mesma transação da revisão.
--   * get_team_keyword_stats: ranking de palavras do time num período (para o MCP).
--
-- ATENÇÃO: record_review_with_findings ganha um parâmetro; a versão de 7 parâmetros é removida
-- para não haver duas sobrecargas ambíguas na chamada via RPC.

-- ---------------------------------------------------------------------------
-- 1. Normalização
-- ---------------------------------------------------------------------------
create or replace function private.normalize_keyword(p_text text)
returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(lower(p_text), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'
  ));
$$;

-- ---------------------------------------------------------------------------
-- 2. Tabela
-- ---------------------------------------------------------------------------
create table public.review_keywords (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.review_history(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  keyword     text not null,
  keyword_key text not null,
  severity    text not null check (severity in ('error', 'warning', 'info')),
  position    smallint not null check (position between 1 and 5),
  reviewed_at timestamptz not null,
  constraint review_keywords_keyword_length check (char_length(keyword) between 2 and 40),
  constraint review_keywords_unique_per_review unique (review_id, keyword_key)
);

create index review_keywords_team_key_time_idx
  on public.review_keywords (team_id, keyword_key, reviewed_at desc);
create index review_keywords_team_time_idx
  on public.review_keywords (team_id, reviewed_at desc);

alter table public.review_keywords enable row level security;

revoke all on public.review_keywords from anon, authenticated, service_role;
grant select on public.review_keywords to authenticated, service_role;

create policy "Membros leem palavras-chave do time"
  on public.review_keywords for select to authenticated
  using (private.is_team_member(team_id));

create policy "Admin lê palavras-chave de todos os times"
  on public.review_keywords for select to authenticated
  using (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Gravação (substitui a função de 7 parâmetros)
-- ---------------------------------------------------------------------------
drop function if exists public.record_review_with_findings(uuid, text, text, text, text, text, jsonb);

create or replace function public.record_review_with_findings(
  p_team_id        uuid,
  p_pr_url         text,
  p_review_summary text,
  p_commit_sha     text  default null,
  p_pr_title       text  default null,
  p_reviewer       text  default null,
  p_findings       jsonb default '[]'::jsonb,
  p_keywords       jsonb default '[]'::jsonb
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
    'keywords_recorded', v_kw_count
  );
end;
$$;

revoke execute on function public.record_review_with_findings(uuid, text, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant  execute on function public.record_review_with_findings(uuid, text, text, text, text, text, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Ranking de palavras-chave do time (usado pela tool get_review_keywords)
-- ---------------------------------------------------------------------------
create or replace function public.get_team_keyword_stats(
  p_team_id uuid,
  p_since   timestamptz,
  p_limit   int default 20
)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.total desc, r.last_seen desc), '[]'::jsonb)
  from (
    select
      mode() within group (order by k.keyword)       as keyword,
      count(*)                                       as total,
      count(*) filter (where k.severity = 'error')   as errors,
      count(*) filter (where k.severity = 'warning') as warnings,
      count(*) filter (where k.severity = 'info')    as infos,
      max(k.reviewed_at)                             as last_seen
    from public.review_keywords k
    where k.team_id = p_team_id and k.reviewed_at >= p_since
    group by k.keyword_key
    order by count(*) desc, max(k.reviewed_at) desc
    limit greatest(least(p_limit, 100), 1)
  ) r;
$$;

revoke execute on function public.get_team_keyword_stats(uuid, timestamptz, int)
  from public, anon, authenticated;
grant  execute on function public.get_team_keyword_stats(uuid, timestamptz, int) to service_role;
