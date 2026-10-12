-- Publicação da review no GitHub pelo MCP server.
--
--   * review_history.github_review_url: URL da review publicada no PR (nula = não publicada).
--     Evita publicar duas vezes a mesma revisão registrada.
--   * set_review_github_url: único jeito de a service_role preencher a coluna
--     (a service_role não tem update em review_history).
--   * private.contains_secret: corrige falso positivo em atribuições como
--     "password = getPassword(user)". Atribuição só conta com valor literal:
--     entre aspas, ou sem aspas e sem ser seguido de "(" ou "." (chamada/membro).

alter table review_history
  add column if not exists github_review_url text,
  add constraint review_history_github_review_url_format
    check (
      github_review_url is null
      or github_review_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+#pullrequestreview-[0-9]+$'
    );

create or replace function public.set_review_github_url(p_review_id uuid, p_url text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_rows int;
begin
  update public.review_history
  set github_review_url = p_url
  where id = p_review_id and github_review_url is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function public.set_review_github_url(uuid, text) from public, anon, authenticated;
grant  execute on function public.set_review_github_url(uuid, text) to service_role;

create or replace function private.contains_secret(p_text text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_text is not null and (
    p_text ~* '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    or p_text ~* '\m(AKIA|ASIA)[0-9A-Z]{16}\M'
    or p_text ~* 'eyJ[A-Za-z0-9_-]{10,}\.'
    or p_text ~* '\m(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{10,})'
    or p_text ~* '(api[_-]?key|secret|token|passw(or)?d|authorization|bearer|credential|service[_-]?key)["'']?\s*[:=]\s*(["''][^"''\s]{8,}["'']|[A-Za-z0-9_+/=-]{8,}(?![A-Za-z0-9_+/=(.-]))'
    or p_text ~* '\mbearer\s+[A-Za-z0-9._~+/=-]{16,}'
  );
$$;
