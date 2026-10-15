-- Provision fixed demo memberships without granting service-role writes to other organizations.

create or replace function public.prevent_restricted_membership_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  is_demo_claim boolean := current_setting('app.demo_access_claim', true) = 'true';
  is_demo_provision boolean := current_setting('app.demo_account_provision', true) = 'true';
  is_anonymous_user boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  target_organization_id uuid := case when tg_op = 'INSERT' then new.organization_id else old.organization_id end;
  target_user_id uuid := case when tg_op = 'INSERT' then new.user_id else old.user_id end;
begin
  if is_demo_provision
    and auth.role() = 'service_role'
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

create or replace function public.provision_fixed_demo_membership(
  target_user_id uuid,
  target_role public.app_role
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  demo_organization_id uuid;
  membership_row public.organization_memberships;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Demo account provisioning requires the service role.';
  end if;

  if target_role not in ('organization_admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Unsupported demo role.';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = target_user_id
      and u.is_anonymous = false
      and coalesce(u.raw_app_meta_data ->> 'demo_account', 'false') = 'true'
      and u.raw_app_meta_data ->> 'demo_role' = target_role::text
  ) then
    raise exception 'The target user is not a matching fixed demo account.';
  end if;

  select o.id into demo_organization_id
  from public.organizations o
  where o.slug = 'demo'
    and o.status = 'active'
  limit 1;

  if demo_organization_id is null then
    raise exception 'Demo organization is unavailable.';
  end if;

  perform set_config('app.demo_account_provision', 'true', true);

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active,
    created_by
  ) values (
    demo_organization_id,
    target_user_id,
    target_role,
    true,
    null
  )
  on conflict (organization_id, user_id) do update set
    role = excluded.role,
    is_active = true,
    updated_at = now()
  returning * into membership_row;

  return membership_row;
end;
$$;

revoke all on function public.provision_fixed_demo_membership(uuid, public.app_role) from public;
grant execute on function public.provision_fixed_demo_membership(uuid, public.app_role) to service_role;
