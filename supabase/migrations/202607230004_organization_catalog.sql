-- Organization catalog foundation: categories, places, products, and services.
-- No real organization data, emails, UUIDs, passwords, or service-role secrets are stored here.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'catalog_item_status') then
    create type public.catalog_item_status as enum ('active', 'inactive', 'archived');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'place_type') then
    create type public.place_type as enum (
      'table',
      'vip_room',
      'playstation',
      'billiard',
      'racing',
      'private_room',
      'service_area',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'service_pricing_type') then
    create type public.service_pricing_type as enum ('fixed', 'hourly');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'catalog_category_type') then
    create type public.catalog_category_type as enum ('product', 'service', 'place');
  end if;
end
$$;

create table if not exists public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.catalog_category_type not null,
  name text not null,
  description text,
  image_path text,
  sort_order integer not null default 0,
  status public.catalog_item_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint catalog_categories_name_not_blank_check check (length(btrim(name)) > 0),
  constraint catalog_categories_sort_order_check check (sort_order >= 0)
);

create unique index if not exists catalog_categories_org_type_lower_name_key
on public.catalog_categories (organization_id, type, lower(name));
create index if not exists catalog_categories_organization_id_idx on public.catalog_categories (organization_id);
create index if not exists catalog_categories_organization_type_idx on public.catalog_categories (organization_id, type);
create index if not exists catalog_categories_organization_status_idx on public.catalog_categories (organization_id, status);
create index if not exists catalog_categories_organization_sort_idx on public.catalog_categories (organization_id, sort_order);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.catalog_categories(id) on delete set null,
  name text not null,
  type public.place_type not null,
  custom_type_name text,
  description text,
  image_path text,
  has_timer boolean not null default false,
  hourly_rate numeric(12,2),
  minimum_minutes integer,
  billing_step_minutes integer,
  capacity integer,
  sort_order integer not null default 0,
  status public.catalog_item_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint places_name_not_blank_check check (length(btrim(name)) > 0),
  constraint places_hourly_rate_check check (hourly_rate is null or hourly_rate >= 0),
  constraint places_minimum_minutes_check check (minimum_minutes is null or minimum_minutes > 0),
  constraint places_billing_step_minutes_check check (billing_step_minutes is null or billing_step_minutes > 0),
  constraint places_capacity_check check (capacity is null or capacity > 0),
  constraint places_sort_order_check check (sort_order >= 0),
  constraint places_timer_fields_check check (
    (has_timer = true and hourly_rate is not null and minimum_minutes is not null and billing_step_minutes is not null)
    or has_timer = false
  ),
  constraint places_custom_type_check check (type <> 'other' or length(btrim(coalesce(custom_type_name, ''))) > 0)
);

create index if not exists places_organization_id_idx on public.places (organization_id);
create index if not exists places_organization_type_idx on public.places (organization_id, type);
create index if not exists places_organization_status_idx on public.places (organization_id, status);
create index if not exists places_organization_sort_idx on public.places (organization_id, sort_order);
create index if not exists places_category_id_idx on public.places (category_id);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.catalog_categories(id) on delete set null,
  sku text,
  name text not null,
  description text,
  characteristics text,
  image_path text,
  sale_price numeric(12,2) not null,
  purchase_price numeric(12,2),
  stock_quantity numeric(14,3) not null default 0,
  minimum_stock_quantity numeric(14,3) not null default 0,
  unit_name text not null default 'шт.',
  track_stock boolean not null default true,
  sort_order integer not null default 0,
  status public.catalog_item_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint products_name_not_blank_check check (length(btrim(name)) > 0),
  constraint products_sale_price_check check (sale_price >= 0),
  constraint products_purchase_price_check check (purchase_price is null or purchase_price >= 0),
  constraint products_stock_quantity_check check (stock_quantity >= 0),
  constraint products_minimum_stock_quantity_check check (minimum_stock_quantity >= 0),
  constraint products_sort_order_check check (sort_order >= 0),
  constraint products_unit_name_not_blank_check check (length(btrim(unit_name)) > 0)
);

create unique index if not exists products_org_sku_key
on public.products (organization_id, lower(sku))
where sku is not null and length(btrim(sku)) > 0;
create index if not exists products_organization_id_idx on public.products (organization_id);
create index if not exists products_organization_status_idx on public.products (organization_id, status);
create index if not exists products_organization_sort_idx on public.products (organization_id, sort_order);
create index if not exists products_category_id_idx on public.products (category_id);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.catalog_categories(id) on delete set null,
  name text not null,
  description text,
  characteristics text,
  image_path text,
  pricing_type public.service_pricing_type not null,
  fixed_price numeric(12,2),
  hourly_rate numeric(12,2),
  minimum_minutes integer,
  billing_step_minutes integer,
  sort_order integer not null default 0,
  status public.catalog_item_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint services_name_not_blank_check check (length(btrim(name)) > 0),
  constraint services_sort_order_check check (sort_order >= 0),
  constraint services_fixed_price_check check (fixed_price is null or fixed_price >= 0),
  constraint services_hourly_rate_check check (hourly_rate is null or hourly_rate >= 0),
  constraint services_minimum_minutes_check check (minimum_minutes is null or minimum_minutes > 0),
  constraint services_billing_step_minutes_check check (billing_step_minutes is null or billing_step_minutes > 0),
  constraint services_pricing_fields_check check (
    (pricing_type = 'fixed' and fixed_price is not null)
    or (pricing_type = 'hourly' and hourly_rate is not null and minimum_minutes is not null and billing_step_minutes is not null)
  )
);

create index if not exists services_organization_id_idx on public.services (organization_id);
create index if not exists services_organization_status_idx on public.services (organization_id, status);
create index if not exists services_organization_pricing_idx on public.services (organization_id, pricing_type);
create index if not exists services_organization_sort_idx on public.services (organization_id, sort_order);
create index if not exists services_category_id_idx on public.services (category_id);

create or replace function public.set_catalog_archived_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.archived_at = now();
  elsif new.status <> 'archived' then
    new.archived_at = null;
  end if;

  return new;
end;
$$;

create or replace function public.assert_catalog_category_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  expected_type public.catalog_category_type;
begin
  if tg_table_name = 'places' then
    expected_type := 'place';
  elsif tg_table_name = 'products' then
    expected_type := 'product';
  elsif tg_table_name = 'services' then
    expected_type := 'service';
  else
    raise exception 'Unsupported catalog table.';
  end if;

  if new.category_id is not null and not exists (
    select 1
    from public.catalog_categories c
    where c.id = new.category_id
      and c.organization_id = new.organization_id
      and c.type = expected_type
      and c.status <> 'archived'
  ) then
    raise exception 'Category does not belong to this organization or catalog type.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_catalog_restricted_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Cannot update protected catalog fields.';
    end if;
  end if;

  if not (
    public.is_platform_owner()
    or public.is_organization_admin(new.organization_id)
  ) then
    raise exception 'Only organization admins can write catalog data for this organization.';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = new.organization_id
      and o.status = 'active'
  ) then
    raise exception 'Organization is not active.';
  end if;

  return new;
end;
$$;

drop trigger if exists catalog_categories_set_updated_at on public.catalog_categories;
create trigger catalog_categories_set_updated_at before update on public.catalog_categories
for each row execute function public.set_updated_at();
drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at before update on public.places
for each row execute function public.set_updated_at();
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();

drop trigger if exists catalog_categories_archived_at on public.catalog_categories;
create trigger catalog_categories_archived_at before update on public.catalog_categories
for each row execute function public.set_catalog_archived_at();
drop trigger if exists places_archived_at on public.places;
create trigger places_archived_at before update on public.places
for each row execute function public.set_catalog_archived_at();
drop trigger if exists products_archived_at on public.products;
create trigger products_archived_at before update on public.products
for each row execute function public.set_catalog_archived_at();
drop trigger if exists services_archived_at on public.services;
create trigger services_archived_at before update on public.services
for each row execute function public.set_catalog_archived_at();

drop trigger if exists places_category_scope on public.places;
create trigger places_category_scope before insert or update on public.places
for each row execute function public.assert_catalog_category_scope();
drop trigger if exists products_category_scope on public.products;
create trigger products_category_scope before insert or update on public.products
for each row execute function public.assert_catalog_category_scope();
drop trigger if exists services_category_scope on public.services;
create trigger services_category_scope before insert or update on public.services
for each row execute function public.assert_catalog_category_scope();

drop trigger if exists catalog_categories_restricted_write on public.catalog_categories;
create trigger catalog_categories_restricted_write before insert or update on public.catalog_categories
for each row execute function public.prevent_catalog_restricted_write();
drop trigger if exists places_restricted_write on public.places;
create trigger places_restricted_write before insert or update on public.places
for each row execute function public.prevent_catalog_restricted_write();
drop trigger if exists products_restricted_write on public.products;
create trigger products_restricted_write before insert or update on public.products
for each row execute function public.prevent_catalog_restricted_write();
drop trigger if exists services_restricted_write on public.services;
create trigger services_restricted_write before insert or update on public.services
for each row execute function public.prevent_catalog_restricted_write();

alter table public.catalog_categories enable row level security;
alter table public.places enable row level security;
alter table public.products enable row level security;
alter table public.services enable row level security;

drop policy if exists "Catalog categories are readable by org access" on public.catalog_categories;
create policy "Catalog categories are readable by org access"
on public.catalog_categories for select to authenticated
using (
  public.is_platform_owner()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "Catalog categories are insertable by org admins" on public.catalog_categories;
create policy "Catalog categories are insertable by org admins"
on public.catalog_categories for insert to authenticated
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Catalog categories are updatable by org admins" on public.catalog_categories;
create policy "Catalog categories are updatable by org admins"
on public.catalog_categories for update to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Places are readable by org access" on public.places;
create policy "Places are readable by org access"
on public.places for select to authenticated
using (
  public.is_platform_owner()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "Places are insertable by org admins" on public.places;
create policy "Places are insertable by org admins"
on public.places for insert to authenticated
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Places are updatable by org admins" on public.places;
create policy "Places are updatable by org admins"
on public.places for update to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Products are readable by org admins" on public.products;
create policy "Products are readable by org admins"
on public.products for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Products are insertable by org admins" on public.products;
create policy "Products are insertable by org admins"
on public.products for insert to authenticated
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Products are updatable by org admins" on public.products;
create policy "Products are updatable by org admins"
on public.products for update to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Services are readable by org access" on public.services;
create policy "Services are readable by org access"
on public.services for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Services are insertable by org admins" on public.services;
create policy "Services are insertable by org admins"
on public.services for insert to authenticated
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Services are updatable by org admins" on public.services;
create policy "Services are updatable by org admins"
on public.services for update to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

create or replace view public.employee_categories
with (security_barrier = true)
as
select id, organization_id, type, name, description, image_path, sort_order, status
from public.catalog_categories
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.employee_places
with (security_barrier = true)
as
select
  id,
  organization_id,
  category_id,
  name,
  type,
  custom_type_name,
  description,
  image_path,
  has_timer,
  hourly_rate,
  minimum_minutes,
  billing_step_minutes,
  capacity,
  sort_order,
  status
from public.places
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.employee_products
with (security_barrier = true)
as
select
  id,
  organization_id,
  category_id,
  sku,
  name,
  description,
  characteristics,
  image_path,
  sale_price,
  unit_name,
  sort_order,
  status
from public.products
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.employee_services
with (security_barrier = true)
as
select
  id,
  organization_id,
  category_id,
  name,
  description,
  characteristics,
  image_path,
  pricing_type,
  fixed_price,
  hourly_rate,
  minimum_minutes,
  billing_step_minutes,
  sort_order,
  status
from public.services
where status = 'active'
  and public.is_organization_member(organization_id);

grant select on public.employee_categories to authenticated;
grant select on public.employee_places to authenticated;
grant select on public.employee_products to authenticated;
grant select on public.employee_services to authenticated;

create or replace function public.set_category_status(target_id uuid, target_status public.catalog_item_status)
returns public.catalog_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.catalog_categories;
begin
  select * into item from public.catalog_categories where id = target_id;
  if item.id is null then raise exception 'Category was not found.'; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(item.organization_id)) then
    raise exception 'Only organization admins can change category status.';
  end if;
  update public.catalog_categories set status = target_status where id = target_id returning * into item;
  return item;
end;
$$;

create or replace function public.set_place_status(target_id uuid, target_status public.catalog_item_status)
returns public.places
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.places;
begin
  select * into item from public.places where id = target_id;
  if item.id is null then raise exception 'Place was not found.'; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(item.organization_id)) then
    raise exception 'Only organization admins can change place status.';
  end if;
  update public.places set status = target_status where id = target_id returning * into item;
  return item;
end;
$$;

create or replace function public.set_product_status(target_id uuid, target_status public.catalog_item_status)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.products;
begin
  select * into item from public.products where id = target_id;
  if item.id is null then raise exception 'Product was not found.'; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(item.organization_id)) then
    raise exception 'Only organization admins can change product status.';
  end if;
  update public.products set status = target_status where id = target_id returning * into item;
  return item;
end;
$$;

create or replace function public.set_service_status(target_id uuid, target_status public.catalog_item_status)
returns public.services
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.services;
begin
  select * into item from public.services where id = target_id;
  if item.id is null then raise exception 'Service was not found.'; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(item.organization_id)) then
    raise exception 'Only organization admins can change service status.';
  end if;
  update public.services set status = target_status where id = target_id returning * into item;
  return item;
end;
$$;

grant execute on function public.set_category_status(uuid, public.catalog_item_status) to authenticated;
grant execute on function public.set_place_status(uuid, public.catalog_item_status) to authenticated;
grant execute on function public.set_product_status(uuid, public.catalog_item_status) to authenticated;
grant execute on function public.set_service_status(uuid, public.catalog_item_status) to authenticated;

drop policy if exists "Organization catalog assets are readable by organization users" on storage.objects;
create policy "Organization catalog assets are readable by organization users"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'organization-assets'
  and (storage.foldername(name))[1] = 'organizations'
  and (
    public.is_platform_owner()
    or public.is_organization_member((storage.foldername(name))[2]::uuid)
  )
);

drop policy if exists "Organization catalog assets are writable by organization admins" on storage.objects;
create policy "Organization catalog assets are writable by organization admins"
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

drop policy if exists "Organization catalog assets are updatable by organization admins" on storage.objects;
create policy "Organization catalog assets are updatable by organization admins"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-assets'
  and (storage.foldername(name))[1] = 'organizations'
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
