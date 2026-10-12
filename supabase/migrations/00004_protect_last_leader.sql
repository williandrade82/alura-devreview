-- Impede que um time fique sem líder por ação de um usuário final:
-- rebaixar, remover ou "sair" sendo o último líder aprovado é bloqueado.
--
-- Não se aplica a:
--   * operações sem JWT de usuário (painel do Supabase, service key, MCP);
--   * exclusão em cascata do time (o time já não existe quando o trigger roda).
-- Assim, o suporte ainda consegue consertar um time órfão ou apagar uma conta.

create or replace function private.protect_last_leader()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  if old.role = 'leader'
     and old.status = 'approved'
     and (tg_op = 'DELETE' or new.role <> 'leader' or new.status <> 'approved')
     and exists (select 1 from public.teams t where t.id = old.team_id)
  then
    -- Mesmo lock da migration 00003: serializa mudanças de liderança no time.
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

drop trigger if exists team_members_protect_last_leader on team_members;
create trigger team_members_protect_last_leader
  before update of role, status or delete on team_members
  for each row execute function private.protect_last_leader();
