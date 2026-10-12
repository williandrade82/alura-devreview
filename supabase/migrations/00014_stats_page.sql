-- Estatísticas da tela /estatisticas (visão geral, regras e ADRs, calibração do modelo).
--
--   * Todas as funções são security invoker: o RLS de review_history, review_findings,
--     review_rules e adrs vale para quem chama, então cada membro só enxerga o próprio time
--     (e o admin, todos). Por isso podem ser liberadas ao papel authenticated.
--   * get_team_stats_overview: totais do período, achados por severidade e por status.
--   * get_team_reference_stats: regras e ADRs mais citados e regras ativas que nunca dispararam.
--   * get_team_recommendation_stats (da 00013): ganha a matriz recomendação x desfecho humano
--     e passa a ser liberada ao authenticated.

-- ---------------------------------------------------------------------------
-- 1. Visão geral do período
-- ---------------------------------------------------------------------------
create or replace function public.get_team_stats_overview(
  p_team_id uuid,
  p_since   timestamptz
)
returns jsonb
language sql stable set search_path = ''
as $$
  with reviews as (
    select id, issues_found, injection_suspected
    from public.review_history
    where team_id = p_team_id and reviewed_at >= p_since
  ),
  found as (
    select f.severity, f.status
    from public.review_findings f
    join reviews r on r.id = f.review_id
  )
  select jsonb_build_object(
    'reviews_total',        (select count(*) from reviews),
    'reviews_clean',        (select count(*) from reviews where issues_found = 0),
    'avg_issues',           (select coalesce(round(avg(issues_found)::numeric, 1), 0) from reviews),
    'injection_suspected',  (select count(*) from reviews where injection_suspected),
    'findings_total',       (select count(*) from found),
    'findings_by_severity', jsonb_build_object(
      'error',   (select count(*) from found where severity = 'error'),
      'warning', (select count(*) from found where severity = 'warning'),
      'info',    (select count(*) from found where severity = 'info')
    ),
    'findings_by_status',   jsonb_build_object(
      'open',      (select count(*) from found where status = 'open'),
      'resolved',  (select count(*) from found where status = 'resolved'),
      'dismissed', (select count(*) from found where status = 'dismissed')
    )
  );
$$;

revoke execute on function public.get_team_stats_overview(uuid, timestamptz) from public, anon;
grant  execute on function public.get_team_stats_overview(uuid, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Regras e ADRs
--    "dismissed" por regra indica possível falso positivo.
--    never_triggered: regras ativas sem nenhum achado no período.
-- ---------------------------------------------------------------------------
create or replace function public.get_team_reference_stats(
  p_team_id uuid,
  p_since   timestamptz,
  p_limit   int default 10
)
returns jsonb
language sql stable set search_path = ''
as $$
  with found as (
    select f.rule_id, f.rule_text, f.adr_id, f.adr_title, f.severity, f.status
    from public.review_findings f
    join public.review_history h on h.id = f.review_id
    where h.team_id = p_team_id and h.reviewed_at >= p_since
  ),
  lim as (select greatest(least(p_limit, 50), 1) as n),
  silent as (
    select r.id, r.rule, r.category
    from public.review_rules r
    where r.team_id = p_team_id and r.active
      and not exists (select 1 from found f where f.rule_id = r.id)
  )
  select jsonb_build_object(
    'rules', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc, x.rule), '[]'::jsonb)
      from (
        select
          f.rule_id,
          coalesce(max(r.rule), max(f.rule_text))       as rule,
          count(*)                                      as total,
          count(*) filter (where f.severity = 'error')  as errors,
          count(*) filter (where f.status = 'dismissed') as dismissed
        from found f
        left join public.review_rules r on r.id = f.rule_id
        where f.rule_id is not null
        group by f.rule_id
        order by count(*) desc
        limit (select n from lim)
      ) x
    ),
    'adrs', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc, x.title), '[]'::jsonb)
      from (
        select
          f.adr_id,
          coalesce(max(a.title), max(f.adr_title)) as title,
          count(*)                                 as total
        from found f
        left join public.adrs a on a.id = f.adr_id
        where f.adr_id is not null
        group by f.adr_id
        order by count(*) desc
        limit (select n from lim)
      ) x
    ),
    'never_triggered', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.category, x.rule), '[]'::jsonb)
      from (
        select s.id, s.rule, s.category
        from silent s
        order by s.category, s.rule
        limit 20
      ) x
    ),
    -- Total real: a lista acima é cortada em 20 e a tela avisa quando há mais.
    'never_triggered_total', (select count(*) from silent)
  );
$$;

revoke execute on function public.get_team_reference_stats(uuid, timestamptz, int) from public, anon;
grant  execute on function public.get_team_reference_stats(uuid, timestamptz, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Calibração do modelo: acrescenta a matriz recomendação x desfecho humano
--    (approved, changes_requested, none = sem decisão humana, pending = ainda não sincronizado).
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
      -- Só approve/request_changes entram na concordância: "comment" nunca concorda nem discorda.
      recommendation in ('approve', 'request_changes')
        and outcome_decision in ('approved', 'changes_requested') as judged,
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
    'matrix', (
      select jsonb_object_agg(rec, jsonb_build_object(
        'approved',          approved,
        'changes_requested', changes_requested,
        'none',              none,
        'pending',           pending
      ))
      from (
        select
          recs.rec,
          count(*) filter (where r.recommendation is not null and r.outcome_decision = 'approved')          as approved,
          count(*) filter (where r.recommendation is not null and r.outcome_decision = 'changes_requested') as changes_requested,
          count(*) filter (where r.recommendation is not null and r.outcome_decision = 'none')              as none,
          count(*) filter (where r.recommendation is not null and r.outcome_decision is null)               as pending
        from (values ('approve'), ('request_changes'), ('comment')) as recs(rec)
        left join r on r.recommendation = recs.rec
        group by recs.rec
      ) m
    ),
    'by_confidence', (
      select coalesce(jsonb_agg(c order by c.confidence), '[]'::jsonb)
      from (
        select
          confidence,
          count(*)                      as total,
          count(*) filter (where judged) as judged,
          count(*) filter (where agree)  as agree
        from r
        group by confidence
      ) c
    )
  )
  from r;
$$;

revoke execute on function public.get_team_recommendation_stats(uuid, timestamptz) from public, anon;
grant  execute on function public.get_team_recommendation_stats(uuid, timestamptz) to authenticated, service_role;
