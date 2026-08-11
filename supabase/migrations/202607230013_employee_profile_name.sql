-- Allow organization admins to set an employee display name while managing the employee.

drop function if exists public.assign_organization_employee(uuid, uuid, text, text, text);
drop function if exists public.update_organization_employee(uuid, text, text, text, integer);

create or replace function public.assign_organization_employee(
  target_organization_id uuid,
  target_user_id uuid,
  target_full_name text default null,
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

  update public.profiles
  set
    full_name = nullif(btrim(target_full_name), ''),
    updated_at = now()
  where id = target_user_id;

  return membership;
end;
$$;

create or replace function public.update_organization_employee(
  target_membership_id uuid,
  target_full_name text,
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

  update public.profiles
  set
    full_name = nullif(btrim(target_full_name), ''),
    updated_at = now()
  where id = existing_membership.user_id;

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

grant execute on function public.assign_organization_employee(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.update_organization_employee(uuid, text, text, text, text, integer) to authenticated;
