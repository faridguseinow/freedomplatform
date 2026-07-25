-- Organization employees module.
-- Auth users are still created manually in Supabase Authentication.
-- This migration does not store passwords, PINs, real emails, or real UUIDs.

alter table public.organization_memberships
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists notes text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists deactivated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'organization_memberships_sort_order_check'
  ) then
    alter table public.organization_memberships
      add constraint organization_memberships_sort_order_check
      check (sort_order >= 0);
  end if;
end
$$;

create index if not exists organization_memberships_employee_lookup_idx
on public.organization_memberships (organization_id, role, is_active, sort_order, created_at);

create or replace function public.set_membership_deactivation_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_active = false and old.is_active is distinct from false then
    new.deactivated_at = now();
  end if;

  if new.is_active = true then
    new.deactivated_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists organization_memberships_deactivation_timestamp on public.organization_memberships;
create trigger organization_memberships_deactivation_timestamp
before update on public.organization_memberships
for each row
execute function public.set_membership_deactivation_timestamp();

create or replace function public.find_available_user_by_email(
  target_email text,
  target_organization_id uuid
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  avatar_path text,
  membership_id uuid,
  membership_role public.app_role,
  membership_is_active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(target_email));
begin
  if normalized_email = '' or normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid exact email is required.';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_organization_admin(target_organization_id)
  ) then
    raise exception 'Only organization admins can search users for this organization.';
  end if;

  return query
  select
    p.id as user_id,
    p.email,
    p.full_name,
    p.avatar_path,
    om.id as membership_id,
    om.role as membership_role,
    om.is_active as membership_is_active
  from public.profiles p
  left join public.organization_memberships om
    on om.user_id = p.id
    and om.organization_id = target_organization_id
  where lower(coalesce(p.email, '')) = normalized_email
    and p.is_active = true
    and not exists (
      select 1
      from public.platform_user_roles pur
      where pur.user_id = p.id
    )
  limit 1;
end;
$$;

create or replace function public.assign_organization_employee(
  target_organization_id uuid,
  target_user_id uuid,
  target_job_title text default null,
  target_phone text default null,
  target_notes text default null
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  membership public.organization_memberships;
begin
  if not (
    public.is_platform_owner()
    or public.is_organization_admin(target_organization_id)
  ) then
    raise exception 'Only organization admins can add employees to this organization.';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = target_organization_id
      and o.status = 'active'
  ) then
    raise exception 'Organization is not active.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.is_active = true
  ) then
    raise exception 'Target user profile does not exist or is inactive.';
  end if;

  if exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = target_user_id
  ) then
    raise exception 'Platform owners cannot be assigned as employees.';
  end if;

  if exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = target_organization_id
      and om.user_id = target_user_id
      and om.role = 'organization_admin'
  ) then
    raise exception 'Organization admins cannot be added as employees.';
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active,
    job_title,
    phone,
    notes,
    created_by
  )
  values (
    target_organization_id,
    target_user_id,
    'employee',
    true,
    nullif(btrim(target_job_title), ''),
    nullif(btrim(target_phone), ''),
    nullif(btrim(target_notes), ''),
    auth.uid()
  )
  on conflict (organization_id, user_id) do update set
    is_active = true,
    job_title = excluded.job_title,
    phone = excluded.phone,
    notes = excluded.notes,
    deactivated_at = null,
    updated_at = now()
  where public.organization_memberships.role = 'employee'
  returning * into membership;

  if membership.id is null then
    raise exception 'User already has a non-employee membership in this organization.';
  end if;

  return membership;
end;
$$;

create or replace function public.update_organization_employee(
  target_membership_id uuid,
  target_job_title text,
  target_phone text,
  target_notes text,
  target_sort_order integer
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_membership public.organization_memberships;
  updated_membership public.organization_memberships;
begin
  if target_sort_order < 0 then
    raise exception 'Sort order cannot be negative.';
  end if;

  select *
  into existing_membership
  from public.organization_memberships om
  where om.id = target_membership_id;

  if existing_membership.id is null then
    raise exception 'Employee membership was not found.';
  end if;

  if existing_membership.role <> 'employee' then
    raise exception 'Only employee memberships can be edited here.';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_organization_admin(existing_membership.organization_id)
  ) then
    raise exception 'Only organization admins can edit employees in this organization.';
  end if;

  update public.organization_memberships
  set
    job_title = nullif(btrim(target_job_title), ''),
    phone = nullif(btrim(target_phone), ''),
    notes = nullif(btrim(target_notes), ''),
    sort_order = target_sort_order,
    updated_at = now()
  where id = target_membership_id
    and organization_id = existing_membership.organization_id
    and user_id = existing_membership.user_id
    and role = 'employee'
  returning * into updated_membership;

  return updated_membership;
end;
$$;

create or replace function public.set_organization_employee_active(
  target_membership_id uuid,
  target_is_active boolean
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_membership public.organization_memberships;
  updated_membership public.organization_memberships;
begin
  select *
  into existing_membership
  from public.organization_memberships om
  where om.id = target_membership_id;

  if existing_membership.id is null then
    raise exception 'Employee membership was not found.';
  end if;

  if existing_membership.role <> 'employee' then
    raise exception 'Only employee memberships can be changed here.';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_organization_admin(existing_membership.organization_id)
  ) then
    raise exception 'Only organization admins can change employees in this organization.';
  end if;

  update public.organization_memberships
  set
    is_active = target_is_active,
    deactivated_at = case when target_is_active then null else now() end,
    updated_at = now()
  where id = target_membership_id
    and role = 'employee'
  returning * into updated_membership;

  return updated_membership;
end;
$$;

grant execute on function public.find_available_user_by_email(text, uuid) to authenticated;
grant execute on function public.assign_organization_employee(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.update_organization_employee(uuid, text, text, text, integer) to authenticated;
grant execute on function public.set_organization_employee_active(uuid, boolean) to authenticated;
