-- ============================================================================
-- DESTRUCTIVE TEST/INITIALIZATION SCRIPT
-- ============================================================================
-- This script deletes ALL tenant organization data by truncating
-- public.organizations with CASCADE, then recreates The Liga in Azerbaijani.
--
-- It intentionally preserves:
--   - auth.users
--   - public.profiles
--   - public.platform_user_roles
--   - supabase_migrations.schema_migrations
--   - storage buckets and storage object metadata
--
-- Run only from a trusted server/CLI context after a fresh backup.
-- Never run from the frontend. Never place service_role keys or DB passwords here.
-- ============================================================================

begin;

select set_config('request.jwt.claim.sub', 'f68a21a5-d2b4-4e96-a331-ff5ccf2cc22c', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('app.finance_write', '1', true);
select set_config('app.shift_write', '1', true);
select set_config('app.inventory_write', '1', true);
select set_config('app.order_write', '1', true);

create or replace function public.get_organization_readiness(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_admin boolean;
  has_employee boolean;
  has_places boolean;
  has_timed_places boolean;
  has_products boolean;
  has_services boolean;
  has_shift_templates boolean;
  has_finance_categories boolean;
  has_share_rate boolean;
  telegram_configured boolean;
  migration_schema_readiness boolean;
  blocker_list text[] := array[]::text[];
  warning_list text[] := array[]::text[];
  required_ready integer := 0;
  required_total integer := 6;
  readiness integer;
begin
  if not (public.is_platform_owner() or public.is_organization_admin(target_organization_id)) then
    raise exception 'You do not have access to organization readiness.';
  end if;

  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_organization_id
      and role = 'organization_admin'
      and is_active = true
  ) into has_admin;

  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_organization_id
      and role = 'employee'
      and is_active = true
  ) into has_employee;

  select exists (select 1 from public.places where organization_id = target_organization_id and status = 'active') into has_places;
  select exists (select 1 from public.places where organization_id = target_organization_id and status = 'active' and has_timer = true) into has_timed_places;
  select exists (select 1 from public.products where organization_id = target_organization_id and status = 'active') into has_products;
  select exists (select 1 from public.services where organization_id = target_organization_id and status = 'active') into has_services;
  select exists (select 1 from public.shift_templates where organization_id = target_organization_id and is_active = true) into has_shift_templates;
  select exists (select 1 from public.finance_categories where organization_id = target_organization_id and is_active = true) into has_finance_categories;
  select public.get_current_platform_share_rate(target_organization_id, current_date) > 0 into has_share_rate;
  select exists (
    select 1 from public.organization_notification_settings
    where organization_id = target_organization_id
      and telegram_enabled = true
      and length(btrim(coalesce(telegram_chat_id, ''))) > 0
  ) into telegram_configured;

  migration_schema_readiness := to_regclass('public.finance_transactions') is not null
    and to_regclass('public.employee_shifts') is not null
    and to_regclass('public.notification_outbox') is not null
    and to_regclass('public.stock_movements') is not null;

  if has_admin then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'admin'); end if;
  if has_employee then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'employee'); end if;
  if has_places then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'places'); end if;
  if has_timed_places then required_ready := required_ready + 1; else warning_list := array_append(warning_list, 'timed_places'); end if;
  if has_shift_templates then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'shift_templates'); end if;
  if has_finance_categories then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'finance_categories'); end if;
  if not has_share_rate then warning_list := array_append(warning_list, 'Platform share rate təyin edilməyib'); end if;
  if not telegram_configured then warning_list := array_append(warning_list, 'telegram'); end if;
  if not has_products and not has_services then warning_list := array_append(warning_list, 'products_or_services'); end if;
  if not migration_schema_readiness then blocker_list := array_append(blocker_list, 'schema'); end if;

  readiness := floor((required_ready::numeric / required_total::numeric) * 100)::integer;

  return jsonb_build_object(
    'organization_id', target_organization_id,
    'has_admin', has_admin,
    'has_employee', has_employee,
    'has_places', has_places,
    'has_timed_places', has_timed_places,
    'has_products', has_products,
    'has_services', has_services,
    'has_shift_templates', has_shift_templates,
    'has_finance_categories', has_finance_categories,
    'has_share_rate', has_share_rate,
    'telegram_configured', telegram_configured,
    'migration_schema_readiness', migration_schema_readiness,
    'readiness_percentage', readiness,
    'blockers', blocker_list,
    'warnings', warning_list
  );
end;
$$;

do $$
declare
  platform_owner_id constant uuid := 'f68a21a5-d2b4-4e96-a331-ff5ccf2cc22c';
  organization_admin_id constant uuid := '249f97ea-f12a-43a7-bb52-5f08bfc2c7ec';
  target_organization_id uuid := gen_random_uuid();
  existing_share_rate numeric(7,4);
  ps_rooms_category_id uuid;
  tables_category_id uuid;
  billiard_category_id uuid;
  hourly_services_category_id uuid;
begin
  if not exists (select 1 from auth.users where id = platform_owner_id) then
    raise exception 'Platform owner auth user does not exist: %', platform_owner_id;
  end if;

  if not exists (select 1 from auth.users where id = organization_admin_id) then
    raise exception 'Organization admin auth user does not exist: %', organization_admin_id;
  end if;

  insert into public.profiles (id, email, full_name, created_at, updated_at, preferred_locale, is_active)
  select id, email, nullif(raw_user_meta_data ->> 'full_name', ''), created_at, now(), 'az', true
  from auth.users
  where id in (platform_owner_id, organization_admin_id)
  on conflict (id) do update
  set
    email = excluded.email,
    preferred_locale = excluded.preferred_locale,
    is_active = true,
    updated_at = now();

  insert into public.platform_user_roles (user_id, role, created_by)
  values (platform_owner_id, 'platform_owner', null)
  on conflict (user_id) do update
  set role = 'platform_owner';

  if exists (select 1 from public.platform_user_roles where user_id = organization_admin_id) then
    raise exception 'The Liga organization admin must not be a platform owner: %', organization_admin_id;
  end if;

  select r.percentage
  into existing_share_rate
  from public.organization_platform_share_rates r
  where r.percentage is not null
  order by r.created_at desc
  limit 1;

  truncate table public.organizations restart identity cascade;

  insert into public.organizations (
    id,
    name,
    slug,
    description,
    logo_path,
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
    'PlayStation, bilyard və istirahət məkanı',
    null,
    'active',
    'az',
    'Asia/Baku',
    'AZN',
    platform_owner_id
  );

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active,
    job_title,
    sort_order,
    created_by
  )
  values (
    target_organization_id,
    organization_admin_id,
    'organization_admin',
    true,
    'The Liga administratoru',
    1,
    platform_owner_id
  );

  insert into public.catalog_categories (
    id,
    organization_id,
    type,
    name,
    sort_order,
    status,
    created_by
  )
  values
    (gen_random_uuid(), target_organization_id, 'place', 'PlayStation otaqları', 10, 'active', organization_admin_id),
    (gen_random_uuid(), target_organization_id, 'place', 'Adi masalar', 20, 'active', organization_admin_id),
    (gen_random_uuid(), target_organization_id, 'place', 'Bilyard və simulyator', 30, 'active', organization_admin_id),
    (gen_random_uuid(), target_organization_id, 'service', 'Saatlıq xidmətlər', 10, 'active', organization_admin_id);

  select id into ps_rooms_category_id
  from public.catalog_categories
  where organization_id = target_organization_id and type = 'place' and name = 'PlayStation otaqları';

  select id into tables_category_id
  from public.catalog_categories
  where organization_id = target_organization_id and type = 'place' and name = 'Adi masalar';

  select id into billiard_category_id
  from public.catalog_categories
  where organization_id = target_organization_id and type = 'place' and name = 'Bilyard və simulyator';

  select id into hourly_services_category_id
  from public.catalog_categories
  where organization_id = target_organization_id and type = 'service' and name = 'Saatlıq xidmətlər';

  insert into public.places (
    organization_id,
    category_id,
    name,
    type,
    has_timer,
    hourly_rate,
    minimum_minutes,
    billing_step_minutes,
    capacity,
    sort_order,
    status,
    created_by
  )
  values
    (target_organization_id, ps_rooms_category_id, 'VIP PS3 №1', 'playstation', true, 3, 60, 30, 4, 10, 'active', organization_admin_id),
    (target_organization_id, ps_rooms_category_id, 'VIP PS3 №2', 'playstation', true, 3, 60, 30, 4, 20, 'active', organization_admin_id),
    (target_organization_id, ps_rooms_category_id, 'VIP PS4 №1', 'playstation', true, 3, 60, 30, 4, 30, 'active', organization_admin_id),
    (target_organization_id, ps_rooms_category_id, 'VIP PS4 №2', 'playstation', true, 3, 60, 30, 4, 40, 'active', organization_admin_id),
    (target_organization_id, ps_rooms_category_id, 'VIP PS5 №1', 'playstation', true, 4, 60, 30, 4, 50, 'active', organization_admin_id),
    (target_organization_id, billiard_category_id, 'Sükan simulyatoru №1', 'racing', true, 4, 60, 30, 1, 60, 'active', organization_admin_id),
    (target_organization_id, billiard_category_id, 'Bilyard №1', 'billiard', true, 4, 60, 30, 4, 70, 'active', organization_admin_id),
    (target_organization_id, tables_category_id, 'Masa №1', 'table', false, null, null, null, 4, 80, 'active', organization_admin_id),
    (target_organization_id, tables_category_id, 'Masa №2', 'table', false, null, null, null, 4, 90, 'active', organization_admin_id),
    (target_organization_id, tables_category_id, 'Masa №3', 'table', false, null, null, null, 4, 100, 'active', organization_admin_id),
    (target_organization_id, tables_category_id, 'Masa №4', 'table', false, null, null, null, 4, 110, 'active', organization_admin_id),
    (target_organization_id, tables_category_id, 'Masa №5', 'table', false, null, null, null, 4, 120, 'active', organization_admin_id);

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
  values
    (target_organization_id, hourly_services_category_id, 'PlayStation saatlıq oyun', 'hourly', 3, 60, 30, 10, 'active', organization_admin_id),
    (target_organization_id, hourly_services_category_id, 'VIP PS5 saatlıq oyun', 'hourly', 4, 60, 30, 20, 'active', organization_admin_id),
    (target_organization_id, hourly_services_category_id, 'Sükan simulyatoru', 'hourly', 4, 60, 30, 30, 'active', organization_admin_id),
    (target_organization_id, hourly_services_category_id, 'Bilyard saatlıq oyun', 'hourly', 4, 60, 30, 40, 'active', organization_admin_id);

  insert into public.shift_templates (
    organization_id,
    name,
    start_time,
    end_time,
    crosses_midnight,
    sort_order,
    is_active,
    expected_duration_minutes,
    late_close_grace_minutes,
    created_by
  )
  values
    (target_organization_id, 'Birinci növbə', time '10:00', time '18:00', false, 1, true, 480, 15, organization_admin_id),
    (target_organization_id, 'İkinci növbə', time '18:00', time '02:00', true, 2, true, 480, 15, organization_admin_id);

  insert into public.organization_notification_settings (
    organization_id,
    telegram_enabled,
    telegram_chat_id,
    notify_shift_opened,
    notify_shift_closed,
    notify_daily_summary,
    notify_cash_variance,
    notify_payment_refused,
    notify_adjustment_requests,
    notify_low_stock
  )
  values (
    target_organization_id,
    false,
    null,
    true,
    true,
    true,
    true,
    true,
    true,
    true
  );

  insert into public.organization_finance_settings (
    organization_id,
    large_expense_threshold,
    require_large_expense_approval,
    default_platform_share_percentage,
    reporting_currency_code,
    financial_month_close_day,
    platform_share_payment_due_days
  )
  values (
    target_organization_id,
    null,
    false,
    existing_share_rate,
    'AZN',
    null,
    10
  );

  insert into public.finance_categories (
    organization_id,
    transaction_type,
    name,
    system_code,
    affects_profit,
    affects_cash_flow,
    eligible_for_platform_share_deduction,
    sort_order,
    is_active,
    is_system,
    created_by
  )
  values
    (target_organization_id, 'income', 'Satış gəlirləri', 'sales', true, true, false, 10, true, true, organization_admin_id),
    (target_organization_id, 'income', 'Digər gəlirlər', 'other_income', true, true, false, 20, true, true, organization_admin_id),
    (target_organization_id, 'income', 'Gəlir düzəlişləri', 'income_adjustment', true, true, false, 30, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'İcarə', 'rent', true, true, true, 100, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Əməkhaqqı', 'salary', true, true, true, 110, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Kommunal xidmətlər', 'utilities', true, true, true, 120, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'İnternet', 'internet', true, true, true, 130, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Məhsul alışları', 'purchases', true, true, true, 140, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Təmir', 'repair', true, true, true, 150, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Texniki xidmət', 'maintenance', true, true, true, 160, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Reklam', 'advertising', true, true, true, 170, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Təmizlik', 'cleaning', true, true, true, 180, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Vergilər', 'taxes', true, true, true, 190, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Çatdırılma', 'delivery', true, true, true, 200, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Bank komissiyaları', 'bank_fees', true, true, true, 210, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Təsərrüfat xərcləri', 'household', true, true, true, 220, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Amortizasiya', 'depreciation', true, false, true, 230, true, true, organization_admin_id),
    (target_organization_id, 'expense', 'Digər xərclər', 'other_expense', true, true, true, 240, true, true, organization_admin_id),
    (target_organization_id, 'platform_share_accrual', 'Freedom Platform payı', 'platform_share', false, false, false, 300, true, true, organization_admin_id),
    (target_organization_id, 'platform_share_payment', 'Freedom Platform ödənişi', 'platform_share_payment', false, true, false, 310, true, true, organization_admin_id);

  if existing_share_rate is not null then
    insert into public.organization_platform_share_rates (
      organization_id,
      percentage,
      effective_from,
      created_by,
      comment
    )
    values (
      target_organization_id,
      existing_share_rate,
      current_date,
      platform_owner_id,
      'The Liga reset zamanı əvvəlki platform share dəyəri saxlanıldı'
    );
  end if;

  raise notice 'The Liga reset complete. organization_id=%', target_organization_id;
end;
$$;

commit;

select set_config('request.jwt.claim.sub', 'f68a21a5-d2b4-4e96-a331-ff5ccf2cc22c', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

select
  o.id,
  o.name,
  o.slug,
  o.description,
  o.default_locale,
  o.timezone,
  o.currency_code,
  o.status
from public.organizations o
where o.slug = 'the-liga';

select role, is_active, count(*)::integer as users
from public.organization_memberships
group by role, is_active
order by role, is_active desc;

select type, count(*)::integer as count
from public.catalog_categories
group by type
order by type;

select
  type,
  has_timer,
  count(*)::integer as count,
  min(hourly_rate) as min_hourly_rate,
  max(hourly_rate) as max_hourly_rate
from public.places
group by type, has_timer
order by type, has_timer desc;

select pricing_type, count(*)::integer as count
from public.services
group by pricing_type
order by pricing_type;

select transaction_type, count(*)::integer as count
from public.finance_categories
group by transaction_type
order by transaction_type;

select *
from public.organization_notification_settings;

select public.get_organization_readiness(id) as readiness
from public.organizations
where slug = 'the-liga';
