-- Strict final consolidator: fail visibly instead of silently skipping a demo-only user.

create or replace function public.consolidate_demo_anonymous_users_strict(
  target_admin_id uuid,
  target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  demo_organization_id uuid;
  candidate record;
  reference_column record;
  replacement_user_id uuid;
  deleted_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Demo user consolidation requires the service role.';
  end if;

  select o.id into demo_organization_id
  from public.organizations o
  where o.slug = 'demo'
  limit 1;

  if demo_organization_id is null then
    raise exception 'Demo organization was not found.';
  end if;

  if not exists (
    select 1 from auth.users u
    join public.organization_memberships om on om.user_id = u.id
    where u.id = target_admin_id
      and om.organization_id = demo_organization_id
      and om.role = 'organization_admin'
      and coalesce(u.raw_app_meta_data ->> 'demo_account', 'false') = 'true'
  ) or not exists (
    select 1 from auth.users u
    join public.organization_memberships om on om.user_id = u.id
    where u.id = target_employee_id
      and om.organization_id = demo_organization_id
      and om.role = 'employee'
      and coalesce(u.raw_app_meta_data ->> 'demo_account', 'false') = 'true'
  ) then
    raise exception 'Fixed demo accounts are not configured.';
  end if;

  perform set_config('app.order_write', '1', true);
  perform set_config('app.shift_write', '1', true);
  perform set_config('app.finance_write', '1', true);
  perform set_config('app.inventory_write', '1', true);
  perform set_config('app.demo_user_consolidation', '1', true);

  for candidate in
    select u.id, om.role
    from auth.users u
    join public.organization_memberships om
      on om.user_id = u.id
     and om.organization_id = demo_organization_id
    where u.is_anonymous = true
      and u.id not in (target_admin_id, target_employee_id)
      and not exists (
        select 1 from public.organization_memberships other_membership
        where other_membership.user_id = u.id
          and other_membership.organization_id <> demo_organization_id
      )
      and not exists (
        select 1 from public.platform_user_roles pur where pur.user_id = u.id
      )
  loop
    replacement_user_id := case
      when candidate.role = 'organization_admin' then target_admin_id
      else target_employee_id
    end;

    for reference_column in
      select n.nspname schema_name, r.relname table_name, a.attname column_name
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      join pg_attribute a on a.attrelid = r.oid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and array_length(c.conkey, 1) = 1
        and n.nspname = 'public'
        and r.relname not in ('profiles', 'organization_memberships', 'platform_user_roles')
        and exists (
          select 1 from pg_attribute oa
          where oa.attrelid = r.oid
            and oa.attname = 'organization_id'
            and not oa.attisdropped
        )
    loop
      execute format(
        'update %I.%I set %I = $1 where %I = $2 and organization_id = $3',
        reference_column.schema_name,
        reference_column.table_name,
        reference_column.column_name,
        reference_column.column_name
      ) using replacement_user_id, candidate.id, demo_organization_id;
    end loop;

    update public.organization_memberships
    set created_by = replacement_user_id
    where organization_id = demo_organization_id
      and created_by = candidate.id;

    update public.employee_lock_pins elp
    set
      pin_updated_by = case when elp.pin_updated_by = candidate.id then replacement_user_id else elp.pin_updated_by end,
      pending_pin_change_requested_by = case
        when elp.pending_pin_change_requested_by = candidate.id then replacement_user_id
        else elp.pending_pin_change_requested_by
      end
    where exists (
      select 1 from public.organization_memberships om
      where om.id = elp.membership_id
        and om.organization_id = demo_organization_id
    ) and (
      elp.pin_updated_by = candidate.id
      or elp.pending_pin_change_requested_by = candidate.id
    );

    delete from public.organization_memberships
    where organization_id = demo_organization_id and user_id = candidate.id;

    delete from auth.users where id = candidate.id and is_anonymous = true;
    deleted_count := deleted_count + 1;
  end loop;

  return jsonb_build_object(
    'organization_id', demo_organization_id,
    'deleted_anonymous_users', deleted_count
  );
end;
$$;

revoke all on function public.consolidate_demo_anonymous_users_strict(uuid, uuid) from public;
grant execute on function public.consolidate_demo_anonymous_users_strict(uuid, uuid) to service_role;
