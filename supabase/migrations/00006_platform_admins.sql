-- Administrador do DevReview (perfil da plataforma, acima dos times).
--
-- O administrador pode:
--   * criar e editar times;
--   * ver os dados de todos os times (somente leitura de regras, ADRs e histórico);
--   * aprovar, promover e remover membros de qualquer time, como os líderes;
--   * associar um usuário que já tem conta a um time (admin_add_member).
-- Regras e ADRs continuam sendo editadas só pelos líderes do time.
--
-- Administradores são criados só por SQL ou service key (ninguém se promove pelo app).

-- ---------------------------------------------------------------------------
-- 1. Tabela e função auxiliar
-- ---------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

revoke all on platform_admins from anon, authenticated;
grant select on platform_admins to authenticated;

create policy "Admin lê o próprio registro"
  on platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_platform_admin() from public, anon;
grant  execute on function private.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Times: só o administrador cria e renomeia
-- ---------------------------------------------------------------------------
alter table teams drop constraint if exists teams_name_length;
alter table teams
  add constraint teams_name_length check (char_length(btrim(name)) between 1 and 100);

create unique index if not exists teams_name_unique on teams (lower(btrim(name)));

grant insert (name) on teams to authenticated;
grant update (name) on teams to authenticated;

create policy "Admin cria times"
  on teams for insert to authenticated
  with check (private.is_platform_admin());

create policy "Admin edita times"
  on teams for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Leitura dos dados de todos os times
-- ---------------------------------------------------------------------------
create policy "Admin lê regras de todos os times"
  on review_rules for select to authenticated
  using (private.is_platform_admin());

create policy "Admin lê ADRs de todos os times"
  on adrs for select to authenticated
  using (private.is_platform_admin());

create policy "Admin lê histórico de todos os times"
  on review_history for select to authenticated
  using (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. Membros: o admin faz o que os líderes fazem, em qualquer time
-- ---------------------------------------------------------------------------
create policy "Admin lê vínculos de todos os times"
  on team_members for select to authenticated
  using (private.is_platform_admin());

create policy "Admin aprova e promove membros"
  on team_members for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

create policy "Admin remove membros"
  on team_members for delete to authenticated
  using (private.is_platform_admin());

-- O admin pode corrigir um time que ficou sem líder, então ignora a proteção
-- do último líder (o limite de 2 líderes continua valendo para todos).
create or replace function private.protect_last_leader()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_platform_admin() then
    return coalesce(new, old);
  end if;

  if old.role = 'leader'
     and old.status = 'approved'
     and (tg_op = 'DELETE' or new.role <> 'leader' or new.status <> 'approved')
     and exists (select 1 from public.teams t where t.id = old.team_id)
  then
    perform pg_advisory_xact_lock(hashtextextended(old.team_id::text, 0));

    if not exists (
      select 1 from public.team_members m
      where m.team_id = old.team_id
        and m.role = 'leader'
        and m.status = 'approved'
        and m.user_id <> old.user_id
    ) then
      raise exception 'O time precisa ter pelo menos um líder'
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Associar um usuário existente a um time (RPC, só para o admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_member(
  p_team_id uuid,
  p_email   text,
  p_role    text default 'member'
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email   text;
begin
  if not private.is_platform_admin() then
    raise exception 'Apenas administradores podem associar membros'
      using errcode = 'insufficient_privilege';
  end if;

  select u.id, u.email into v_user_id, v_email
  from auth.users u
  where lower(u.email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception 'Usuário não encontrado. Ele precisa criar a conta primeiro.'
      using errcode = 'no_data_found';
  end if;

  -- Já existindo um pedido pendente, ele é aprovado e o papel é atualizado.
  insert into public.team_members (team_id, user_id, role, status, email)
  values (p_team_id, v_user_id, p_role, 'approved', v_email)
  on conflict (team_id, user_id)
  do update set role = excluded.role, status = 'approved';
end;
$$;

revoke execute on function public.admin_add_member(uuid, text, text) from public, anon;
grant  execute on function public.admin_add_member(uuid, text, text) to authenticated;
