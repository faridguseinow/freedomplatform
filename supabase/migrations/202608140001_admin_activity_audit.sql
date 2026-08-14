-- Human-readable admin activity tracking and safer audit logging.

create or replace function public.log_audit(
  target_organization_id uuid,
  target_action text,
  target_entity_type text,
  target_entity_id uuid default null,
  target_metadata jsonb default '{}'::jsonb
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  log_row public.audit_logs;
begin
  if length(btrim(coalesce(target_action, ''))) = 0 then
    raise exception 'Audit action is required.';
  end if;

  if length(btrim(coalesce(target_entity_type, ''))) = 0 then
    raise exception 'Audit entity type is required.';
  end if;

  if not (
    public.is_platform_owner()
    or (
      target_organization_id is not null
      and public.is_organization_member(target_organization_id)
    )
  ) then
    raise exception 'You do not have access to write this audit log.';
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    shift_id
  )
  values (
    target_organization_id,
    auth.uid(),
    target_action,
    target_entity_type,
    target_entity_id,
    coalesce(target_metadata, '{}'::jsonb),
    case
      when target_organization_id is null then null
      else public.current_employee_open_shift_id(target_organization_id)
    end
  )
  returning * into log_row;

  return log_row;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, uuid, jsonb) to authenticated;

drop policy if exists "Audit logs readable by platform owners and organization admins" on public.audit_logs;
drop policy if exists "Audit logs readable by organization admins" on public.audit_logs;
create policy "Audit logs readable by platform owners and organization admins"
on public.audit_logs for select to authenticated
using (
  public.is_platform_owner()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);
