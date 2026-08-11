-- The Liga safe configuration template.
-- Run only after replacing placeholder UUID values in the configuration section.
-- This file intentionally does not contain real user UUIDs, emails, passwords, or secrets.

begin;

do $$
declare
  target_organization_id uuid := '00000000-0000-0000-0000-000000000001';
  target_platform_owner_id uuid := '00000000-0000-0000-0000-000000000002';
  target_admin_id uuid := '00000000-0000-0000-0000-000000000003';
  places_category_id uuid;
  timed_service_id uuid;
begin
  if target_organization_id::text like '00000000-%'
    or target_platform_owner_id::text like '00000000-%'
    or target_admin_id::text like '00000000-%'
  then
    raise exception 'Replace placeholder UUID values before running The Liga seed.';
  end if;

  insert into public.organizations (
    id,
    name,
    slug,
    description,
    status,
    default_locale,
    timezone,
    currency_code,
    created_by
  )
  values (
    target_organization_id,
    'The Liga',
    'the-liga',
    'The Liga launch configuration',
    'active',
    'ru',
    'Asia/Baku',
    'AZN',
    target_platform_owner_id
  )
  on conflict (id) do update
  set
    name = excluded.name,
    slug = excluded.slug,
    default_locale = excluded.default_locale,
    timezone = excluded.timezone,
    currency_code = excluded.currency_code,
    updated_at = now();

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active,
    job_title,
    created_by
  )
  values (
    target_organization_id,
    target_admin_id,
    'organization_admin',
    true,
    'The Liga admin',
    target_platform_owner_id
  )
  on conflict (organization_id, user_id) do update
  set role = 'organization_admin', is_active = true, updated_at = now();

  insert into public.catalog_categories (
    organization_id,
    type,
    name,
    sort_order,
    status,
    created_by
  )
  values
    (target_organization_id, 'place', 'Игровые места', 10, 'active', target_admin_id),
    (target_organization_id, 'service', 'Почасовые услуги', 20, 'active', target_admin_id)
  on conflict do nothing;

  select id into places_category_id
  from public.catalog_categories
  where organization_id = target_organization_id and type = 'place'
  order by sort_order asc
  limit 1;

  insert into public.services (
    organization_id,
    category_id,
    name,
    pricing_type,
    hourly_rate,
    minimum_minutes,
    billing_step_minutes,
    sort_order,
    status,
    created_by
  )
  values (
    target_organization_id,
    (select id from public.catalog_categories where organization_id = target_organization_id and type = 'service' order by sort_order asc limit 1),
    'Почасовая игра',
    'hourly',
    3,
    60,
    30,
    10,
    'active',
    target_admin_id
  )
  on conflict do nothing
  returning id into timed_service_id;

  if timed_service_id is null then
    select id into timed_service_id
    from public.services
    where organization_id = target_organization_id and pricing_type = 'hourly'
    order by created_at asc
    limit 1;
  end if;

  insert into public.places (
    organization_id,
    category_id,
    name,
    type,
    has_timer,
    hourly_rate,
    minimum_minutes,
    billing_step_minutes,
    sort_order,
    status,
    created_by
  )
  values
    (target_organization_id, places_category_id, 'VIP PS3 1', 'playstation', true, 3, 60, 30, 10, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'VIP PS3 2', 'playstation', true, 3, 60, 30, 20, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'VIP PS4 1', 'playstation', true, 3, 60, 30, 30, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'VIP PS4 2', 'playstation', true, 3, 60, 30, 40, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'VIP PS5 1', 'playstation', true, 4, 60, 30, 50, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'Racing Simulator 1', 'racing', true, 4, 60, 30, 60, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'Billiard 1', 'billiard', true, 4, 60, 30, 70, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'Table 1', 'table', false, null, null, null, 80, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'Table 2', 'table', false, null, null, null, 90, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'Table 3', 'table', false, null, null, null, 100, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'Table 4', 'table', false, null, null, null, 110, 'active', target_admin_id),
    (target_organization_id, places_category_id, 'Table 5', 'table', false, null, null, null, 120, 'active', target_admin_id)
  on conflict do nothing;

  insert into public.shift_templates (
    organization_id,
    name,
    start_time,
    end_time,
    crosses_midnight,
    sort_order,
    is_active,
    created_by
  )
  values
    (target_organization_id, 'Первая смена', time '10:00', time '18:00', false, 10, true, target_admin_id),
    (target_organization_id, 'Вторая смена', time '18:00', time '02:00', true, 20, true, target_admin_id)
  on conflict do nothing;

  perform set_config('request.jwt.claim.sub', target_admin_id::text, true);
  perform public.seed_standard_finance_categories(target_organization_id);

  -- Platform share percentage is intentionally not configured here.
  -- A platform owner must set it manually or by running set_platform_share_rate(...)
  -- after choosing the actual percentage.
end;
$$;

commit;
