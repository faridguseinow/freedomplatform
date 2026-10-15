-- Permit only the demo-user reference to change on otherwise immutable stock history.

create or replace function public.prevent_stock_movement_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.system_purge', true) = '1' then
      return old;
    end if;
    raise exception 'Stock movements are immutable.';
  end if;

  if tg_op = 'UPDATE' then
    if current_setting('app.demo_user_consolidation', true) = '1'
      and auth.role() = 'service_role'
      and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by')
      and exists (
        select 1
        from public.organizations o
        where o.id = old.organization_id
          and o.slug = 'demo'
      )
    then
      return new;
    end if;

    raise exception 'Stock movements are immutable.';
  end if;

  if current_setting('app.inventory_write', true) <> '1' then
    raise exception 'Stock movements can be created only by inventory functions.';
  end if;

  return new;
end;
$$;

create or replace function public.consolidate_demo_anonymous_users_safe(
  target_admin_id uuid,
  target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Demo user consolidation requires the service role.';
  end if;

  perform set_config('app.order_write', '1', true);
  perform set_config('app.shift_write', '1', true);
  perform set_config('app.finance_write', '1', true);
  perform set_config('app.inventory_write', '1', true);
  perform set_config('app.demo_user_consolidation', '1', true);

  return public.consolidate_demo_anonymous_users(target_admin_id, target_employee_id);
end;
$$;

revoke all on function public.consolidate_demo_anonymous_users_safe(uuid, uuid) from public;
grant execute on function public.consolidate_demo_anonymous_users_safe(uuid, uuid) to service_role;
