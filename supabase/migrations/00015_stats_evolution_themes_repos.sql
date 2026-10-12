-- Estatísticas da segunda rodada da tela /estatisticas: evolução no tempo, temas e repositórios.
--
--   * Todas as funções são security invoker (RLS de quem chama): cada membro só enxerga o
--     próprio time e o admin, todos. Por isso são liberadas ao papel authenticated.
--   * get_team_stats_timeseries: revisões e achados por dia ou por semana, incluindo os
--     períodos vazios (zeros), para a evolução não esconder lacunas.
--   * get_team_keyword_trends: ranking de temas (palavras-chave) com o total do período
--     anterior de mesmo tamanho, para mostrar se o tema sobe ou desce.
--   * get_team_repo_stats: revisões, issues e achados por categoria em cada repositório.

-- ---------------------------------------------------------------------------
-- 1. Evolução no tempo
-- ---------------------------------------------------------------------------
create or replace function public.get_team_stats_timeseries(
  p_team_id uuid,
  p_since   timestamptz,
  p_bucket  text default 'week'
)
returns jsonb
language sql stable set search_path = ''
as $$
  with p as (
    select
      case when p_bucket = 'day' then 'day' else 'week' end as bucket,
      -- Limita a série (no máximo ~2 anos) para o generate_series não crescer sem controle.
      greatest(p_since, now() - interval '2 years') as since
  ),
  series as (
    select generate_series(
      date_trunc(p.bucket, p.since),
      date_trunc(p.bucket, now()),
      case when p.bucket = 'day' then interval '1 day' else interval '1 week' end
    ) as bucket_start
    from p
  ),
  rev as (
    select
      date_trunc(p.bucket, h.reviewed_at) as bucket_start,
      count(*)                            as reviews,
      coalesce(sum(h.issues_found), 0)    as issues
    from public.review_history h, p
    where h.team_id = p_team_id and h.reviewed_at >= p.since
    group by 1
  ),
  fnd as (
    select
      date_trunc(p.bucket, h.reviewed_at)             as bucket_start,
      count(*) filter (where f.severity = 'error')    as errors,
      count(*) filter (where f.severity = 'warning')  as warnings,
      count(*) filter (where f.severity = 'info')     as infos
    from public.review_findings f
    join public.review_history h on h.id = f.review_id, p
    where h.team_id = p_team_id and h.reviewed_at >= p.since
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bucket_start', s.bucket_start,
      'reviews',      coalesce(r.reviews, 0),
      'issues',       coalesce(r.issues, 0),
      'avg_issues',   case when coalesce(r.reviews, 0) = 0 then null
                           else round(r.issues::numeric / r.reviews, 1) end,
      'errors',       coalesce(f.errors, 0),
      'warnings',     coalesce(f.warnings, 0),
      'infos',        coalesce(f.infos, 0)
    ) order by s.bucket_start
  ), '[]'::jsonb)
  from series s
  left join rev r on r.bucket_start = s.bucket_start
  left join fnd f on f.bucket_start = s.bucket_start;
$$;

revoke execute on function public.get_team_stats_timeseries(uuid, timestamptz, text) from public, anon;
grant  execute on function public.get_team_stats_timeseries(uuid, timestamptz, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Temas (palavras-chave) com a variação contra o período anterior
--    Período anterior = mesma duração, imediatamente antes de p_since.
-- ---------------------------------------------------------------------------
create or replace function public.get_team_keyword_trends(
  p_team_id uuid,
  p_since   timestamptz,
  p_limit   int default 10
)
returns jsonb
language sql stable set search_path = ''
as $$
  with cur as (
    select
      k.keyword_key,
      mode() within group (order by k.keyword)       as keyword,
      count(*)                                       as total,
      count(*) filter (where k.severity = 'error')   as errors,
      count(*) filter (where k.severity = 'warning') as warnings,
      count(*) filter (where k.severity = 'info')    as infos,
      max(k.reviewed_at)                             as last_seen
    from public.review_keywords k
    where k.team_id = p_team_id and k.reviewed_at >= p_since
    group by k.keyword_key
  ),
  prev as (
    select k.keyword_key, count(*) as total
    from public.review_keywords k
    where k.team_id = p_team_id
      and k.reviewed_at >= p_since - (now() - p_since)
      and k.reviewed_at <  p_since
    group by k.keyword_key
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc, x.last_seen desc), '[]'::jsonb)
  from (
    select
      c.keyword, c.total, c.errors, c.warnings, c.infos, c.last_seen,
      coalesce(p.total, 0) as previous_total
    from cur c
    left join prev p on p.keyword_key = c.keyword_key
    order by c.total desc, c.last_seen desc
    limit greatest(least(p_limit, 50), 1)
  ) x;
$$;

revoke execute on function public.get_team_keyword_trends(uuid, timestamptz, int) from public, anon;
grant  execute on function public.get_team_keyword_trends(uuid, timestamptz, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Repositórios: revisões, issues (erro + aviso) e achados por categoria
-- ---------------------------------------------------------------------------
create or replace function public.get_team_repo_stats(
  p_team_id uuid,
  p_since   timestamptz,
  p_limit   int default 10
)
returns jsonb
language sql stable set search_path = ''
as $$
  with rev as (
    select h.id, h.repo, h.issues_found
    from public.review_history h
    where h.team_id = p_team_id and h.reviewed_at >= p_since
  ),
  fnd as (
    select r.repo, f.category, count(*) as n
    from public.review_findings f
    join rev r on r.id = f.review_id
    group by r.repo, f.category
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.issues desc, x.reviews desc, x.repo), '[]'::jsonb)
  from (
    select
      r.repo,
      count(*)                                       as reviews,
      sum(r.issues_found)                            as issues,
      round(avg(r.issues_found)::numeric, 1)         as avg_issues,
      jsonb_build_object(
        'style',        coalesce((select n from fnd where fnd.repo = r.repo and fnd.category = 'style'), 0),
        'architecture', coalesce((select n from fnd where fnd.repo = r.repo and fnd.category = 'architecture'), 0),
        'security',     coalesce((select n from fnd where fnd.repo = r.repo and fnd.category = 'security'), 0),
        'performance',  coalesce((select n from fnd where fnd.repo = r.repo and fnd.category = 'performance'), 0)
      ) as by_category
    from rev r
    group by r.repo
    order by sum(r.issues_found) desc, count(*) desc, r.repo
    limit greatest(least(p_limit, 50), 1)
  ) x;
$$;

revoke execute on function public.get_team_repo_stats(uuid, timestamptz, int) from public, anon;
grant  execute on function public.get_team_repo_stats(uuid, timestamptz, int) to authenticated, service_role;
