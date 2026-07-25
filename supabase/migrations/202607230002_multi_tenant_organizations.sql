create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'app_role') then
    create type public.app_role as enum ('platform_owner', 'organization_admin', 'employee');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'organization_status') then
    create type public.organization_status as enum ('active', 'suspended', 'archived');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists preferred_locale text not null default 'ru',
  add column if not exists is_active boolean not null default true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
      and is_nullable = 'NO'
  ) then
    alter table public.profiles alter column role drop not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'organization_id'
      and is_nullable = 'NO'
  ) then
    alter table public.profiles alter column organization_id drop not null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'profiles_preferred_locale_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_locale_check
      check (preferred_locale in ('ru', 'az', 'en')) not valid;
  end if;
end
$$;

alter table public.profiles validate constraint profiles_preferred_locale_check;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  logo_path text,
  status public.organization_status not null default 'active',
  default_locale text not null default 'ru',
  timezone text not null default 'Asia/Baku',
  currency_code text not null default 'AZN',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint organizations_name_not_blank_check check (length(btrim(name)) > 0),
  constraint organizations_slug_format_check check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint organizations_default_locale_check check (default_locale in ('ru', 'az', 'en')),
  constraint organizations_currency_code_check check (currency_code = upper(currency_code) and length(currency_code) = 3),
  constraint organizations_archived_at_check check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived')
  )
);

create index if not exists organizations_status_idx on public.organizations (status);
create index if not exists organizations_created_by_idx on public.organizations (created_by);
create index if not exists organizations_created_at_idx on public.organizations (created_at desc);
create index if not exists organizations_slug_idx on public.organizations (slug);

create table if not exists public.platform_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint platform_user_roles_role_check check (role = 'platform_owner')
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_role_check check (role in ('organization_admin', 'employee')),
  constraint organization_memberships_organization_user_key unique (organization_id, user_id)
);

create index if not exists organization_memberships_user_id_idx on public.organization_memberships (user_id);
create index if not exists organization_memberships_organization_id_idx on public.organization_memberships (organization_id);
create index if not exists organization_memberships_organization_role_idx on public.organization_memberships (organization_id, role);
create index if not exists organization_memberships_organization_active_idx on public.organization_memberships (organization_id, is_active);
create index if not exists organization_memberships_user_active_idx on public.organization_memberships (user_id, is_active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

drop trigger if exists organization_memberships_set_updated_at on public.organization_memberships;
create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.is_profile_active(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.is_active = true
  );
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_user_roles pur
    join public.profiles p on p.id = pur.user_id
    where pur.user_id = auth.uid()
      and pur.role = 'platform_owner'
      and p.is_active = true
  );
$$;

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
    and p.is_active = true;
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
      order by
        case om.role when 'organization_admin' then 1 else 2 end,
        om.created_at asc
      limit 1
    )
  end;
$$;

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

  if default_locale not in ('ru', 'az', 'en') then
    raise exception 'Unsupported default locale.';
  end if;

  if length(normalized_currency) <> 3 then
    raise exception 'Currency code must contain 3 characters.';
  end if;

  if admin_user_id is not null and not exists (select 1 from public.profiles p where p.id = admin_user_id and p.is_active = true) then
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

create or replace function public.assign_organization_admin(
  target_organization_id uuid,
  target_user_id uuid
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  membership public.organization_memberships;
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can assign organization admins.';
  end if;

  if exists (select 1 from public.platform_user_roles pur where pur.user_id = target_user_id) then
    raise exception 'Platform owners cannot be assigned as organization members.';
  end if;

  if not exists (select 1 from public.organizations o where o.id = target_organization_id and o.status <> 'archived') then
    raise exception 'Organization does not exist or is archived.';
  end if;

  if not exists (select 1 from public.profiles p where p.id = target_user_id and p.is_active = true) then
    raise exception 'Target user profile does not exist or is inactive.';
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active,
    created_by
  )
  values (
    target_organization_id,
    target_user_id,
    'organization_admin',
    true,
    auth.uid()
  )
  on conflict (organization_id, user_id) do update set
    role = 'organization_admin',
    is_active = true,
    updated_at = now()
  returning * into membership;

  return membership;
end;
$$;

create or replace function public.prevent_restricted_organization_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_platform_owner() then
    if new.status = 'archived' and old.status <> 'archived' and new.archived_at is null then
      new.archived_at = now();
    end if;
    return new;
  end if;

  if not public.is_organization_admin(old.id) then
    raise exception 'Only organization admins can update their organization.';
  end if;

  if new.id is distinct from old.id
    or new.slug is distinct from old.slug
    or new.status is distinct from old.status
    or new.created_by is distinct from old.created_by
    or new.archived_at is distinct from old.archived_at
  then
    raise exception 'Organization admins cannot update system organization fields.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_restricted_membership_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
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

insert into public.profiles (id, email, full_name, created_at, updated_at)
select id, email, nullif(raw_user_meta_data ->> 'full_name', ''), created_at, now()
from auth.users
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  updated_at = now();

insert into public.platform_user_roles (user_id, role, created_by)
select p.id, 'platform_owner'::public.app_role, null
from public.profiles p
where exists (
  select 1
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'role'
)
and (to_jsonb(p) ->> 'role') = 'platform_owner'
on conflict (user_id) do nothing;

do $$
declare
  legacy_admin record;
  fallback_owner uuid;
  migrated_organization_id uuid;
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'role'
  ) and exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'organization_id'
  ) then
    select user_id into fallback_owner
    from public.platform_user_roles
    order by created_at asc
    limit 1;

    for legacy_admin in
      select
        p.id as user_id,
        coalesce(nullif(to_jsonb(p) ->> 'organization_id', '')::uuid, gen_random_uuid()) as organization_id
      from public.profiles p
      where (to_jsonb(p) ->> 'role') = 'organization_admin'
    loop
      insert into public.organizations (
        id,
        name,
        slug,
        status,
        created_by
      )
      values (
        legacy_admin.organization_id,
        'Migrated Organization',
        'migrated-' || replace(legacy_admin.organization_id::text, '-', ''),
        'active',
        coalesce(fallback_owner, legacy_admin.user_id)
      )
      on conflict (id) do nothing
      returning id into migrated_organization_id;

      insert into public.organization_memberships (
        organization_id,
        user_id,
        role,
        created_by
      )
      values (
        legacy_admin.organization_id,
        legacy_admin.user_id,
        'organization_admin',
        fallback_owner
      )
      on conflict (organization_id, user_id) do update set
        role = 'organization_admin',
        is_active = true,
        updated_at = now();
    end loop;
  end if;
end
$$;

alter table public.profiles drop column if exists role;
alter table public.profiles drop column if exists organization_id;

drop trigger if exists organizations_restricted_update on public.organizations;
create trigger organizations_restricted_update
before update on public.organizations
for each row
execute function public.prevent_restricted_organization_update();

drop trigger if exists organization_memberships_restricted_write on public.organization_memberships;
create trigger organization_memberships_restricted_write
before insert or update on public.organization_memberships
for each row
execute function public.prevent_restricted_membership_write();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.platform_user_roles enable row level security;
alter table public.organization_memberships enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Profiles are readable by allowed users" on public.profiles;
create policy "Profiles are readable by allowed users"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_platform_owner()
  or exists (
    select 1
    from public.organization_memberships own_membership
    join public.organization_memberships target_membership
      on target_membership.organization_id = own_membership.organization_id
    join public.organizations o on o.id = own_membership.organization_id
    where own_membership.user_id = auth.uid()
      and own_membership.role = 'organization_admin'
      and own_membership.is_active = true
      and target_membership.user_id = profiles.id
      and target_membership.is_active = true
      and o.status = 'active'
  )
);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid() and is_active = true)
with check (id = auth.uid());

drop policy if exists "Platform owners can update profiles" on public.profiles;
create policy "Platform owners can update profiles"
on public.profiles
for update
to authenticated
using (public.is_platform_owner())
with check (public.is_platform_owner());

drop policy if exists "Organizations are readable by access context" on public.organizations;
create policy "Organizations are readable by access context"
on public.organizations
for select
to authenticated
using (
  public.is_platform_owner()
  or public.is_organization_member(id)
);

drop policy if exists "Platform owners can insert organizations" on public.organizations;
create policy "Platform owners can insert organizations"
on public.organizations
for insert
to authenticated
with check (public.is_platform_owner() and created_by = auth.uid());

drop policy if exists "Platform owners and organization admins can update organizations" on public.organizations;
create policy "Platform owners and organization admins can update organizations"
on public.organizations
for update
to authenticated
using (public.is_platform_owner() or public.is_organization_admin(id))
with check (public.is_platform_owner() or public.is_organization_admin(id));

drop policy if exists "Platform owners can read platform roles" on public.platform_user_roles;
create policy "Platform owners can read platform roles"
on public.platform_user_roles
for select
to authenticated
using (public.is_platform_owner() or user_id = auth.uid());

drop policy if exists "Memberships are readable by access context" on public.organization_memberships;
create policy "Memberships are readable by access context"
on public.organization_memberships
for select
to authenticated
using (
  public.is_platform_owner()
  or user_id = auth.uid()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "Platform owners and admins can insert memberships" on public.organization_memberships;
create policy "Platform owners and admins can insert memberships"
on public.organization_memberships
for insert
to authenticated
with check (
  public.is_platform_owner()
  or (
    public.is_organization_admin(organization_id)
    and role = 'employee'
  )
);

drop policy if exists "Platform owners and admins can update memberships" on public.organization_memberships;
create policy "Platform owners and admins can update memberships"
on public.organization_memberships
for update
to authenticated
using (
  public.is_platform_owner()
  or (
    public.is_organization_admin(organization_id)
    and role = 'employee'
  )
)
with check (
  public.is_platform_owner()
  or (
    public.is_organization_admin(organization_id)
    and role = 'employee'
  )
);

insert into storage.buckets (id, name, public)
values ('organization-assets', 'organization-assets', false)
on conflict (id) do nothing;

drop policy if exists "Organization assets are readable by organization users" on storage.objects;
create policy "Organization assets are readable by organization users"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'organization-assets'
  and (
    public.is_platform_owner()
    or public.is_organization_member((storage.foldername(name))[2]::uuid)
  )
);

drop policy if exists "Organization assets are writable by owners and admins" on storage.objects;
create policy "Organization assets are writable by owners and admins"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-assets'
  and (storage.foldername(name))[1] = 'organizations'
  and (
    public.is_platform_owner()
    or public.is_organization_admin((storage.foldername(name))[2]::uuid)
  )
);

drop policy if exists "Organization assets are updatable by owners and admins" on storage.objects;
create policy "Organization assets are updatable by owners and admins"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-assets'
  and (
    public.is_platform_owner()
    or public.is_organization_admin((storage.foldername(name))[2]::uuid)
  )
)
with check (
  bucket_id = 'organization-assets'
  and (storage.foldername(name))[1] = 'organizations'
  and (
    public.is_platform_owner()
    or public.is_organization_admin((storage.foldername(name))[2]::uuid)
  )
);
