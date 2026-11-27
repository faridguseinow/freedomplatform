-- Authenticator app (TOTP) sign-in, configurable per organization.
--
-- When organizations.mfa_required is true, every admin and employee of that
-- organization must sign in with a second factor (Supabase Auth MFA, aal2).
-- The rule is enforced in the database, not only in the UI: the core access
-- helpers used by RLS policies and RPCs stop recognising a membership in such
-- an organization until the session JWT has aal = 'aal2'.
--
-- The flag defaults to false, so applying this migration changes nothing for
-- existing organizations. It is switched on per organization by the platform
-- owner (see 202611271002_enable_mfa_for_the_liga.sql for The Liga).

alter table public.organizations
  add column if not exists mfa_required boolean not null default false;

comment on column public.organizations.mfa_required is
  'When true, members must sign in with an authenticator app (session aal2) to access organization data.';

-- True when the current session satisfies the MFA requirement of the
-- organization with the given flag. Kept inline-friendly (sql, stable).
create or replace function public.session_meets_organization_mfa(target_mfa_required boolean)
returns boolean
language sql
stable
set search_path = public
as $$
  select not coalesce(target_mfa_required, false)
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke all on function public.session_meets_organization_mfa(boolean) from public;
grant execute on function public.session_meets_organization_mfa(boolean) to authenticated;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.organization_memberships om
      join public.organizations o on o.id = om.organization_id
      join public.profiles p on p.id = om.user_id
      where om.organization_id = target_organization_id
        and om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('organization_admin', 'employee')
        and o.status = 'active'
        and p.is_active = true
        and public.session_meets_organization_mfa(o.mfa_required)
    );
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.organization_memberships om
      join public.organizations o on o.id = om.organization_id
      join public.profiles p on p.id = om.user_id
      where om.organization_id = target_organization_id
        and om.user_id = auth.uid()
        and om.is_active = true
        and om.role = 'organization_admin'
        and o.status = 'active'
        and p.is_active = true
        and public.session_meets_organization_mfa(o.mfa_required)
    );
$$;

create or replace function public.current_user_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.organization_id
  from public.organization_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.profiles p on p.id = om.user_id
  where om.user_id = auth.uid()
    and om.is_active = true
    and o.status = 'active'
    and p.is_active = true
    and public.session_meets_organization_mfa(o.mfa_required);
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platform_owner() then 'platform_owner'::public.app_role
    else (
      select om.role
      from public.organization_memberships om
      join public.organizations o on o.id = om.organization_id
      join public.profiles p on p.id = om.user_id
      where om.user_id = auth.uid()
        and om.is_active = true
        and o.status = 'active'
        and p.is_active = true
        and public.session_meets_organization_mfa(o.mfa_required)
      order by
        case om.role when 'organization_admin' then 1 else 2 end,
        om.created_at asc
      limit 1
    )
  end;
$$;

create or replace function public.current_user_primary_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.organization_id
  from public.organization_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.profiles p on p.id = om.user_id
  where om.user_id = auth.uid()
    and om.is_active = true
    and o.status = 'active'
    and p.is_active = true
    and public.session_meets_organization_mfa(o.mfa_required)
  order by case om.role when 'organization_admin' then 1 else 2 end, om.created_at asc
  limit 1;
$$;

-- Lets the app ask, before the second factor is verified, whether the signed
-- in user must use an authenticator app. Returns only a boolean about the
-- caller's own memberships, so it is safe to call at aal1.
create or replace function public.get_my_mfa_requirement()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    join public.organizations o on o.id = om.organization_id
    join public.profiles p on p.id = om.user_id
    where om.user_id = auth.uid()
      and om.is_active = true
      and om.role in ('organization_admin', 'employee')
      and o.status = 'active'
      and o.mfa_required = true
      and p.is_active = true
  )
  and not public.is_platform_owner();
$$;

revoke all on function public.get_my_mfa_requirement() from public;
grant execute on function public.get_my_mfa_requirement() to authenticated;

-- Only the platform owner can switch the requirement on or off from the app.
-- Organization admins keep their existing right to edit other organization
-- fields. Calls without a user (migrations, service role) are allowed.
create or replace function public.prevent_organization_mfa_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.mfa_required is distinct from old.mfa_required
    and auth.uid() is not null
    and not public.is_platform_owner()
  then
    raise exception 'Only the platform owner can change the authenticator requirement.';
  end if;

  return new;
end;
$$;

drop trigger if exists organizations_mfa_requirement_guard on public.organizations;
create trigger organizations_mfa_requirement_guard
before update of mfa_required on public.organizations
for each row
execute function public.prevent_organization_mfa_change();
