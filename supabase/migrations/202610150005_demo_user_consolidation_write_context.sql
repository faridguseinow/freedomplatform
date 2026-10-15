-- Allow the demo-only consolidation function to update guarded historical references.

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

  return public.consolidate_demo_anonymous_users(target_admin_id, target_employee_id);
end;
$$;

revoke all on function public.consolidate_demo_anonymous_users_safe(uuid, uuid) from public;
grant execute on function public.consolidate_demo_anonymous_users_safe(uuid, uuid) to service_role;
