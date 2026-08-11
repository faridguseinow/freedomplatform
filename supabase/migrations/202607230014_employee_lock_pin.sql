-- Employee site lock PINs.
-- PIN hashes are stored in a separate table without direct client reads.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.employee_lock_pins (
  membership_id uuid primary key references public.organization_memberships(id) on delete cascade,
  pin_hash text,
  pin_set_at timestamptz,
  pin_updated_by uuid references auth.users(id),
  pending_pin_hash text,
  pending_pin_change_requested_at timestamptz,
  pending_pin_change_requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists employee_lock_pins_set_updated_at on public.employee_lock_pins;
create trigger employee_lock_pins_set_updated_at
before update on public.employee_lock_pins
for each row
execute function public.set_updated_at();

alter table public.employee_lock_pins enable row level security;

revoke all on public.employee_lock_pins from anon;
revoke all on public.employee_lock_pins from authenticated;

create or replace function public.get_my_employee_lock_state(
  target_organization_id uuid
)
returns table (
  membership_id uuid,
  has_pin boolean,
  pin_set_at timestamptz,
  has_pending_pin_change boolean,
  pending_pin_change_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Employee access to this organization is required.';
  end if;

  return query
  select
    om.id as membership_id,
    elp.pin_hash is not null as has_pin,
    elp.pin_set_at,
    elp.pending_pin_hash is not null as has_pending_pin_change,
    elp.pending_pin_change_requested_at
  from public.organization_memberships om
  left join public.employee_lock_pins elp on elp.membership_id = om.id
  where om.organization_id = target_organization_id
    and om.user_id = auth.uid()
    and om.role = 'employee'
    and om.is_active = true
  limit 1;
end;
$$;

create or replace function public.get_organization_employee_lock_states(
  target_organization_id uuid
)
returns table (
  membership_id uuid,
  has_pin boolean,
  pin_set_at timestamptz,
  has_pending_pin_change boolean,
  pending_pin_change_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not (
    public.is_platform_owner()
    or public.is_organization_admin(target_organization_id)
  ) then
    raise exception 'Only organization admins can read employee PIN state.';
  end if;

  return query
  select
    om.id as membership_id,
    elp.pin_hash is not null as has_pin,
    elp.pin_set_at,
    elp.pending_pin_hash is not null as has_pending_pin_change,
    elp.pending_pin_change_requested_at
  from public.organization_memberships om
  left join public.employee_lock_pins elp on elp.membership_id = om.id
  where om.organization_id = target_organization_id
    and om.role = 'employee';
end;
$$;

create or replace function public.set_employee_lock_pin(
  target_membership_id uuid,
  target_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_membership public.organization_memberships;
begin
  if target_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must contain exactly 4 digits.';
  end if;

  select *
  into target_membership
  from public.organization_memberships om
  where om.id = target_membership_id;

  if target_membership.id is null or target_membership.role <> 'employee' then
    raise exception 'Employee membership was not found.';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_organization_admin(target_membership.organization_id)
  ) then
    raise exception 'Only organization admins can set employee PINs.';
  end if;

  insert into public.employee_lock_pins (
    membership_id,
    pin_hash,
    pin_set_at,
    pin_updated_by,
    pending_pin_hash,
    pending_pin_change_requested_at,
    pending_pin_change_requested_by
  )
  values (
    target_membership_id,
    crypt(target_pin, gen_salt('bf')),
    now(),
    auth.uid(),
    null,
    null,
    null
  )
  on conflict (membership_id) do update set
    pin_hash = excluded.pin_hash,
    pin_set_at = excluded.pin_set_at,
    pin_updated_by = excluded.pin_updated_by,
    pending_pin_hash = null,
    pending_pin_change_requested_at = null,
    pending_pin_change_requested_by = null,
    updated_at = now();
end;
$$;

create or replace function public.request_employee_lock_pin_change(
  target_membership_id uuid,
  target_pin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership public.organization_memberships;
begin
  if target_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must contain exactly 4 digits.';
  end if;

  select *
  into target_membership
  from public.organization_memberships om
  where om.id = target_membership_id;

  if target_membership.id is null
    or target_membership.role <> 'employee'
    or target_membership.is_active = false
  then
    raise exception 'Active employee membership was not found.';
  end if;

  if target_membership.user_id <> auth.uid() then
    raise exception 'Employees can request PIN changes only for their own workplace.';
  end if;

  insert into public.employee_lock_pins (
    membership_id,
    pending_pin_hash,
    pending_pin_change_requested_at,
    pending_pin_change_requested_by
  )
  values (
    target_membership_id,
    crypt(target_pin, gen_salt('bf')),
    now(),
    auth.uid()
  )
  on conflict (membership_id) do update set
    pending_pin_hash = excluded.pending_pin_hash,
    pending_pin_change_requested_at = excluded.pending_pin_change_requested_at,
    pending_pin_change_requested_by = excluded.pending_pin_change_requested_by,
    updated_at = now();
end;
$$;

create or replace function public.approve_employee_lock_pin_change(
  target_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership public.organization_memberships;
  pending_hash text;
begin
  select *
  into target_membership
  from public.organization_memberships om
  where om.id = target_membership_id;

  if target_membership.id is null or target_membership.role <> 'employee' then
    raise exception 'Employee membership was not found.';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_organization_admin(target_membership.organization_id)
  ) then
    raise exception 'Only organization admins can approve employee PIN changes.';
  end if;

  select elp.pending_pin_hash
  into pending_hash
  from public.employee_lock_pins elp
  where elp.membership_id = target_membership_id;

  if pending_hash is null then
    raise exception 'There is no pending PIN change for this employee.';
  end if;

  update public.employee_lock_pins
  set
    pin_hash = pending_hash,
    pin_set_at = now(),
    pin_updated_by = auth.uid(),
    pending_pin_hash = null,
    pending_pin_change_requested_at = null,
    pending_pin_change_requested_by = null,
    updated_at = now()
  where membership_id = target_membership_id;
end;
$$;

create or replace function public.reject_employee_lock_pin_change(
  target_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership public.organization_memberships;
begin
  select *
  into target_membership
  from public.organization_memberships om
  where om.id = target_membership_id;

  if target_membership.id is null or target_membership.role <> 'employee' then
    raise exception 'Employee membership was not found.';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_organization_admin(target_membership.organization_id)
  ) then
    raise exception 'Only organization admins can reject employee PIN changes.';
  end if;

  update public.employee_lock_pins
  set
    pending_pin_hash = null,
    pending_pin_change_requested_at = null,
    pending_pin_change_requested_by = null,
    updated_at = now()
  where membership_id = target_membership_id;
end;
$$;

create or replace function public.verify_employee_lock_pin(
  target_membership_id uuid,
  target_pin text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  stored_hash text;
begin
  if target_pin !~ '^[0-9]{4}$' then
    return false;
  end if;

  select elp.pin_hash
  into stored_hash
  from public.organization_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.profiles p on p.id = om.user_id
  join public.employee_lock_pins elp on elp.membership_id = om.id
  where om.id = target_membership_id
    and om.user_id = auth.uid()
    and om.role = 'employee'
    and om.is_active = true
    and o.status = 'active'
    and p.is_active = true;

  if stored_hash is null then
    return false;
  end if;

  return crypt(target_pin, stored_hash) = stored_hash;
end;
$$;

grant execute on function public.get_my_employee_lock_state(uuid) to authenticated;
grant execute on function public.get_organization_employee_lock_states(uuid) to authenticated;
grant execute on function public.set_employee_lock_pin(uuid, text) to authenticated;
grant execute on function public.request_employee_lock_pin_change(uuid, text) to authenticated;
grant execute on function public.approve_employee_lock_pin_change(uuid) to authenticated;
grant execute on function public.reject_employee_lock_pin_change(uuid) to authenticated;
grant execute on function public.verify_employee_lock_pin(uuid, text) to authenticated;
