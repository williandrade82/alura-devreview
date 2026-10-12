-- Papéis por time (leader/member), auto-cadastro com aprovação e RLS por time.
--
-- Modelo:
--   * team_members.role   : 'leader' | 'member'  (máximo 2 líderes aprovados por time)
--   * team_members.status : 'pending' | 'approved'
--   * Auto-cadastro: o front chama auth.signUp com { data: { team_id } }; o trigger
--     em auth.users cria o vínculo como member/pending. O usuário nunca escolhe
--     o próprio papel nem o próprio status.
--   * Líder aprova (status), promove (role) ou remove membros do próprio time.
--   * O PRIMEIRO líder de cada time precisa ser criado manualmente (SQL/service key).

-- ---------------------------------------------------------------------------
-- 1. Tabela team_members (idempotente: já pode ter sido criada à mão)
-- ---------------------------------------------------------------------------
create table if not exists team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    text not null default 'member',
  primary key (team_id, user_id)
);
alter table team_members enable row level security;

-- Linhas já existentes ficam aprovadas; novas nascem pendentes.
alter table team_members add column if not exists status text not null default 'approved';
alter table team_members alter column status set default 'pending';

alter table team_members drop constraint if exists team_members_role_check;
update team_members set role = 'leader' where role = 'admin';
alter table team_members alter column role set default 'member';
alter table team_members
  add constraint team_members_role_check check (role in ('leader', 'member'));

alter table team_members drop constraint if exists team_members_status_check;
alter table team_members
  add constraint team_members_status_check check (status in ('pending', 'approved'));

-- Só quem já está aprovado pode ser líder.
alter table team_members drop constraint if exists team_members_leader_approved;
alter table team_members
  add constraint team_members_leader_approved check (role <> 'leader' or status = 'approved');

-- E-mail denormalizado: o líder precisa saber quem pediu para entrar, e
-- auth.users não é legível pelo front.
alter table team_members add column if not exists email text;
update team_members m set email = u.email from auth.users u where u.id = m.user_id and m.email is null;

create index if not exists team_members_user_id_idx on team_members (user_id);

-- ---------------------------------------------------------------------------
-- 2. Funções auxiliares (security definer evita recursão de RLS em team_members)
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id
      and m.user_id = (select auth.uid())
      and m.status = 'approved'
  );
$$;

create or replace function private.is_team_leader(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id
      and m.user_id = (select auth.uid())
      and m.status = 'approved'
      and m.role = 'leader'
  );
$$;

revoke execute on function private.is_team_member(uuid), private.is_team_leader(uuid) from public, anon;
grant  execute on function private.is_team_member(uuid), private.is_team_leader(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Máximo de 2 líderes por time (lock por time evita corrida entre aprovações)
-- ---------------------------------------------------------------------------
create or replace function private.enforce_leader_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role = 'leader' then
    perform pg_advisory_xact_lock(hashtextextended(new.team_id::text, 0));
    if (
      select count(*) from public.team_members m
      where m.team_id = new.team_id
        and m.role = 'leader'
        and m.user_id <> new.user_id
    ) >= 2 then
      raise exception 'Cada time pode ter no máximo 2 líderes'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_leader_limit on team_members;
create trigger team_members_leader_limit
  before insert or update of role on team_members
  for each row execute function private.enforce_leader_limit();

-- ---------------------------------------------------------------------------
-- 4. Auto-cadastro: cria o vínculo pendente a partir do metadata do signUp
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  begin
    v_team_id := nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid;
  exception when others then
    v_team_id := null;
  end;

  if v_team_id is not null and exists (select 1 from public.teams where id = v_team_id) then
    insert into public.team_members (team_id, user_id, role, status, email)
    values (v_team_id, new.id, 'member', 'pending', new.email)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. RLS de team_members
--    Sem policy de INSERT: só o trigger acima (ou a service key) cria vínculos.
-- ---------------------------------------------------------------------------
revoke all on team_members from anon, authenticated;
grant select, delete on team_members to authenticated;
-- Update restrito por coluna: ninguém troca team_id/user_id.
grant update (role, status) on team_members to authenticated;

-- "Usuário lê o próprio vínculo" já existe; recriada para a migration ser reproduzível.
drop policy if exists "Usuário lê o próprio vínculo" on team_members;
create policy "Usuário lê o próprio vínculo"
  on team_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Líder lê vínculos do time"
  on team_members for select to authenticated
  using (private.is_team_leader(team_id));

create policy "Líder aprova e promove membros do time"
  on team_members for update to authenticated
  using (private.is_team_leader(team_id))
  with check (private.is_team_leader(team_id));

create policy "Líder remove membros do time"
  on team_members for delete to authenticated
  using (private.is_team_leader(team_id));

create policy "Usuário cancela o próprio vínculo"
  on team_members for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. review_rules, adrs, review_history: leitura só para membros aprovados,
--    escrita só para líderes (rules e adrs). Histórico é escrito só pelo MCP.
-- ---------------------------------------------------------------------------
drop policy if exists "Admins gerenciam regras do time" on review_rules;
drop policy if exists "Leitura pública de review_rules" on review_rules;
drop policy if exists "Leitura pública de review_history" on review_history;
drop policy if exists "Leitura pública de adrs" on adrs;

revoke all on review_rules, review_history, adrs from anon;
grant select on review_rules, review_history, adrs to authenticated;
grant insert, update, delete on review_rules, adrs to authenticated;

create policy "Membros leem regras do time"
  on review_rules for select to authenticated
  using (private.is_team_member(team_id));
create policy "Líderes criam regras do time"
  on review_rules for insert to authenticated
  with check (private.is_team_leader(team_id));
create policy "Líderes editam regras do time"
  on review_rules for update to authenticated
  using (private.is_team_leader(team_id))
  with check (private.is_team_leader(team_id));
create policy "Líderes excluem regras do time"
  on review_rules for delete to authenticated
  using (private.is_team_leader(team_id));

create policy "Membros leem ADRs do time"
  on adrs for select to authenticated
  using (private.is_team_member(team_id));
create policy "Líderes criam ADRs do time"
  on adrs for insert to authenticated
  with check (private.is_team_leader(team_id));
create policy "Líderes editam ADRs do time"
  on adrs for update to authenticated
  using (private.is_team_leader(team_id))
  with check (private.is_team_leader(team_id));
create policy "Líderes excluem ADRs do time"
  on adrs for delete to authenticated
  using (private.is_team_leader(team_id));

create policy "Membros leem histórico do time"
  on review_history for select to authenticated
  using (private.is_team_member(team_id));

-- teams continua legível por anon: a tela de cadastro lista os times (apenas id e nome).
