-- Persistent demo identities and runtime cleanup scoped exclusively to organizations.slug = 'demo'.

create or replace function public.prevent_restricted_membership_write()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  is_demo_claim boolean := current_setting('app.demo_access_claim', true) = 'true';
  is_anonymous_user boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  target_organization_id uuid := case when tg_op = 'INSERT' then new.organization_id else old.organization_id end;
  target_user_id uuid := case when tg_op = 'INSERT' then new.user_id else old.user_id end;
begin
  if auth.role() = 'service_role'
    and exists (
      select 1
      from public.organizations o
      join auth.users u on u.id = target_user_id
      where o.id = target_organization_id
        and o.slug = 'demo'
        and o.status = 'active'
        and coalesce(u.raw_app_meta_data ->> 'demo_account', 'false') = 'true'
    )
  then
    return new;
  end if;

  if is_demo_claim
    and is_anonymous_user
    and target_user_id = auth.uid()
    and exists (
      select 1
      from public.organizations o
      where o.id = target_organization_id
        and o.slug = 'demo'
        and o.status = 'active'
    )
  then
    return new;
  end if;

  if public.is_platform_owner() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_organization_admin(new.organization_id) then
      raise exception 'Only organization admins can add employees to their organization.';
    end if;

    if new.role <> 'employee' then
      raise exception 'Organization admins can create only employee memberships.';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_organization_admin(old.organization_id) then
      raise exception 'Only organization admins can update employees in their organization.';
    end if;

    if old.role <> 'employee'
      or new.role <> 'employee'
      or new.organization_id is distinct from old.organization_id
      or new.user_id is distinct from old.user_id
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Organization admins can update only employee activity in their organization.';
    end if;

    return new;
  end if;

  raise exception 'Unsupported membership operation.';
end;
$$;

create or replace function public.close_demo_runtime(target_reason text default 'Demo inactivity timeout')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  demo_organization_id uuid;
  sessions_closed integer := 0;
  orders_closed integer := 0;
  shifts_closed integer := 0;
begin
  select o.id into demo_organization_id
  from public.organizations o
  where o.slug = 'demo'
  limit 1;

  if demo_organization_id is null then
    return jsonb_build_object('reset', false, 'reason', 'demo_organization_not_found');
  end if;

  perform set_config('app.order_write', '1', true);
  perform set_config('app.shift_write', '1', true);
  perform set_config('app.inventory_write', '1', true);

  update public.timed_sessions
  set
    status = 'cancelled',
    ended_at = now(),
    paused_at = null,
    cancellation_reason = target_reason,
    updated_at = now()
  where organization_id = demo_organization_id
    and status = 'active';
  get diagnostics sessions_closed = row_count;

  update public.stock_reservations
  set status = 'cancelled'
  where organization_id = demo_organization_id
    and status = 'active';

  update public.order_adjustment_requests
  set status = 'cancelled'
  where organization_id = demo_organization_id
    and status = 'pending';

  update public.orders
  set
    status = 'cancelled',
    closed_at = now(),
    updated_at = now()
  where organization_id = demo_organization_id
    and status in ('open', 'waiting_payment');
  get diagnostics orders_closed = row_count;

  update public.shift_handovers
  set
    status = 'cancelled',
    completed_at = now()
  where organization_id = demo_organization_id
    and status in ('pending', 'accepted');

  update public.employee_shifts
  set
    status = 'force_closed',
    closed_at = now(),
    force_close_reason = target_reason,
    updated_at = now()
  where organization_id = demo_organization_id
    and status in ('open', 'closing');
  get diagnostics shifts_closed = row_count;

  update public.operational_days
  set
    status = 'completed',
    closed_at = now(),
    updated_at = now()
  where organization_id = demo_organization_id
    and status in ('open', 'waiting_final_shift');

  return jsonb_build_object(
    'reset', true,
    'organization_id', demo_organization_id,
    'sessions_closed', sessions_closed,
    'orders_closed', orders_closed,
    'shifts_closed', shifts_closed
  );
end;
$$;

revoke all on function public.close_demo_runtime(text) from public;
grant execute on function public.close_demo_runtime(text) to service_role;

create or replace function public.cleanup_stale_demo_runtime()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  demo_organization_id uuid;
  last_activity_at timestamptz;
  result jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('freedom-platform:demo-runtime-cleanup', 0)) then
    return jsonb_build_object('reset', false, 'reason', 'cleanup_in_progress');
  end if;

  if auth.role() <> 'service_role'
    and not (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'demo_account', 'false') = 'true'
      and exists (
        select 1
        from public.organization_memberships om
        join public.organizations o on o.id = om.organization_id
        where om.user_id = auth.uid()
          and om.is_active = true
          and o.slug = 'demo'
      )
    )
  then
    raise exception 'Demo runtime cleanup is restricted to demo accounts.';
  end if;

  select o.id into demo_organization_id
  from public.organizations o
  where o.slug = 'demo'
  limit 1;

  if demo_organization_id is null then
    return jsonb_build_object('reset', false, 'reason', 'demo_organization_not_found');
  end if;

  select max(activity_at) into last_activity_at
  from (
    select max(o.updated_at) as activity_at
    from public.orders o
    where o.organization_id = demo_organization_id
      and o.status in ('open', 'waiting_payment')
    union all
    select max(ts.updated_at)
    from public.timed_sessions ts
    where ts.organization_id = demo_organization_id
      and ts.status = 'active'
    union all
    select max(es.updated_at)
    from public.employee_shifts es
    where es.organization_id = demo_organization_id
      and es.status in ('open', 'closing')
    union all
    select max(od.updated_at)
    from public.operational_days od
    where od.organization_id = demo_organization_id
      and od.status in ('open', 'waiting_final_shift')
  ) activity;

  if last_activity_at is null then
    return jsonb_build_object('reset', false, 'reason', 'no_open_runtime');
  end if;

  if last_activity_at > now() - interval '60 minutes' then
    return jsonb_build_object(
      'reset', false,
      'reason', 'active',
      'last_activity_at', last_activity_at
    );
  end if;

  result := public.close_demo_runtime('Demo inactivity timeout');
  return result || jsonb_build_object('reason', 'idle_timeout', 'last_activity_at', last_activity_at);
end;
$$;

revoke all on function public.cleanup_stale_demo_runtime() from public;
grant execute on function public.cleanup_stale_demo_runtime() to authenticated, service_role;

create or replace function public.consolidate_demo_anonymous_users(
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
  skipped_count integer := 0;
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
    select 1
    from auth.users u
    join public.organization_memberships om
      on om.user_id = u.id
     and om.organization_id = demo_organization_id
     and om.role = 'organization_admin'
     and om.is_active = true
    where u.id = target_admin_id
      and coalesce(u.raw_app_meta_data ->> 'demo_account', 'false') = 'true'
  ) then
    raise exception 'The fixed demo administrator is not configured.';
  end if;

  if not exists (
    select 1
    from auth.users u
    join public.organization_memberships om
      on om.user_id = u.id
     and om.organization_id = demo_organization_id
     and om.role = 'employee'
     and om.is_active = true
    where u.id = target_employee_id
      and coalesce(u.raw_app_meta_data ->> 'demo_account', 'false') = 'true'
  ) then
    raise exception 'The fixed demo employee is not configured.';
  end if;

  for candidate in
    select u.id, om.role
    from auth.users u
    join public.organization_memberships om
      on om.user_id = u.id
     and om.organization_id = demo_organization_id
    where u.is_anonymous = true
      and u.id not in (target_admin_id, target_employee_id)
      and not exists (
        select 1
        from public.organization_memberships other_membership
        where other_membership.user_id = u.id
          and other_membership.organization_id <> demo_organization_id
      )
      and not exists (
        select 1
        from public.platform_user_roles pur
        where pur.user_id = u.id
      )
  loop
    replacement_user_id := case
      when candidate.role = 'organization_admin' then target_admin_id
      else target_employee_id
    end;

    begin
      for reference_column in
        select
          namespace.nspname as schema_name,
          relation.relname as table_name,
          attribute.attname as column_name
        from pg_constraint constraint_row
        join pg_class relation on relation.oid = constraint_row.conrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        join pg_attribute attribute
          on attribute.attrelid = relation.oid
         and attribute.attnum = constraint_row.conkey[1]
        where constraint_row.contype = 'f'
          and constraint_row.confrelid = 'auth.users'::regclass
          and array_length(constraint_row.conkey, 1) = 1
          and namespace.nspname = 'public'
          and relation.relname not in ('profiles', 'organization_memberships', 'platform_user_roles')
          and exists (
            select 1
            from pg_attribute organization_attribute
            where organization_attribute.attrelid = relation.oid
              and organization_attribute.attname = 'organization_id'
              and not organization_attribute.attisdropped
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

      delete from public.organization_memberships
      where organization_id = demo_organization_id
        and user_id = candidate.id;

      delete from auth.users
      where id = candidate.id
        and is_anonymous = true;

      deleted_count := deleted_count + 1;
    exception when others then
      skipped_count := skipped_count + 1;
    end;
  end loop;

  return jsonb_build_object(
    'organization_id', demo_organization_id,
    'deleted_anonymous_users', deleted_count,
    'skipped_anonymous_users', skipped_count
  );
end;
$$;

revoke all on function public.consolidate_demo_anonymous_users(uuid, uuid) from public;
grant execute on function public.consolidate_demo_anonymous_users(uuid, uuid) to service_role;

-- Close only currently open demo runtime records once when this migration is applied.
select public.close_demo_runtime('Initial cleanup of stale demo runtime');
