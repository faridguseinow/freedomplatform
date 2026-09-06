create or replace function public.resolve_organization_login(target_slug text)
returns table (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  organization_logo_path text,
  organization_status public.organization_status
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.slug, o.logo_path, o.status
  from public.organizations o
  where o.slug = lower(btrim(target_slug))
  limit 1;
$$;

revoke all on function public.resolve_organization_login(text) from public;
grant execute on function public.resolve_organization_login(text) to anon, authenticated;

drop policy if exists "Organization login logos are publicly readable" on storage.objects;
create policy "Organization login logos are publicly readable"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'organization-assets'
  and (storage.foldername(name))[1] = 'organizations'
  and (storage.foldername(name))[3] = 'logos'
  and exists (
    select 1
    from public.organizations o
    where o.id::text = (storage.foldername(name))[2]
      and o.status = 'active'
  )
);

create or replace function public.prevent_restricted_membership_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  is_demo_claim boolean := current_setting('app.demo_access_claim', true) = 'true';
  is_anonymous_user boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  target_organization_id uuid := case when tg_op = 'INSERT' then new.organization_id else old.organization_id end;
  target_user_id uuid := case when tg_op = 'INSERT' then new.user_id else old.user_id end;
begin
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

create or replace function public.claim_demo_access(target_role public.app_role)
returns public.app_role
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_organization_id uuid;
begin
  if auth.uid() is null or not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Demo access requires an anonymous session.';
  end if;

  if target_role not in ('organization_admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Unsupported demo role.';
  end if;

  select o.id
  into demo_organization_id
  from public.organizations o
  where o.slug = 'demo'
    and o.status = 'active'
  limit 1;

  if demo_organization_id is null then
    raise exception 'Demo organization is unavailable.';
  end if;

  perform set_config('app.demo_access_claim', 'true', true);

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active,
    created_by
  )
  values (
    demo_organization_id,
    auth.uid(),
    target_role,
    true,
    null
  )
  on conflict (organization_id, user_id) do update set
    role = excluded.role,
    is_active = true,
    updated_at = now();

  return target_role;
end;
$$;

revoke all on function public.claim_demo_access(public.app_role) from public;
grant execute on function public.claim_demo_access(public.app_role) to authenticated;
