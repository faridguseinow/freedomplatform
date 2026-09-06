create or replace function public.is_reserved_organization_slug(target_slug text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(btrim(target_slug)) = any (
    array['admin', 'www', 'platform', 'app', 'api', 'mail', 'support', 'status', 'static', 'assets']::text[]
  );
$$;

do $$
begin
  if exists (
    select 1
    from public.organizations
    where public.is_reserved_organization_slug(slug)
  ) then
    raise exception 'Reserved organization slugs exist and must be renamed before this migration can be applied.';
  end if;
end;
$$;

alter table public.organizations
drop constraint if exists organizations_slug_reserved_check;

alter table public.organizations
add constraint organizations_slug_reserved_check
check (not public.is_reserved_organization_slug(slug));

create or replace function public.resolve_organization_host(target_slug text)
returns table (
  organization_id uuid,
  organization_slug text,
  organization_status public.organization_status
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.slug, o.status
  from public.organizations o
  where o.slug = lower(btrim(target_slug))
  limit 1;
$$;

revoke all on function public.resolve_organization_host(text) from public;
grant execute on function public.resolve_organization_host(text) to anon, authenticated;

create or replace function public.create_organization_with_admin(
  name text,
  slug text,
  description text default null,
  logo_path text default null,
  default_locale text default 'ru',
  timezone text default 'Asia/Baku',
  currency_code text default 'AZN',
  admin_user_id uuid default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  created_organization public.organizations;
  normalized_slug text := lower(btrim(slug));
  normalized_currency text := upper(btrim(currency_code));
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can create organizations.';
  end if;

  if length(btrim(name)) = 0 then
    raise exception 'Organization name is required.';
  end if;

  if normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Organization slug must contain only lowercase letters, numbers, and hyphens.';
  end if;

  if public.is_reserved_organization_slug(normalized_slug) then
    raise exception 'Organization slug is reserved by the platform.';
  end if;

  if default_locale not in ('ru', 'az', 'en') then
    raise exception 'Unsupported default locale.';
  end if;

  if length(normalized_currency) <> 3 then
    raise exception 'Currency code must contain 3 characters.';
  end if;

  if admin_user_id is not null and not exists (
    select 1 from public.profiles p where p.id = admin_user_id and p.is_active = true
  ) then
    raise exception 'Admin user profile does not exist or is inactive.';
  end if;

  insert into public.organizations (
    name,
    slug,
    description,
    logo_path,
    default_locale,
    timezone,
    currency_code,
    created_by
  )
  values (
    btrim(name),
    normalized_slug,
    nullif(btrim(description), ''),
    nullif(btrim(logo_path), ''),
    default_locale,
    timezone,
    normalized_currency,
    auth.uid()
  )
  returning * into created_organization;

  if admin_user_id is not null then
    if exists (select 1 from public.platform_user_roles pur where pur.user_id = admin_user_id) then
      raise exception 'Platform owners cannot be assigned as organization members.';
    end if;

    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      created_by
    )
    values (
      created_organization.id,
      admin_user_id,
      'organization_admin',
      auth.uid()
    )
    on conflict (organization_id, user_id) do update set
      role = 'organization_admin',
      is_active = true,
      updated_at = now();
  end if;

  return created_organization;
end;
$$;
