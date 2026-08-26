-- Replace percentage-based platform share with a fixed monthly platform fee.
-- Legacy platform_share column/table names stay for compatibility with existing data and UI queries.

alter table public.organization_finance_settings
add column if not exists monthly_platform_fee numeric(14,2) not null default 200;

do $$
begin
  alter table public.organization_finance_settings
  add constraint organization_finance_settings_monthly_fee_check check (monthly_platform_fee >= 0);
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.get_monthly_platform_fee(
  target_organization_id uuid,
  target_period_end date default current_date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.monthly_platform_fee
      from public.organization_finance_settings s
      where s.organization_id = target_organization_id
      limit 1
    ),
    200
  )::numeric(14,2);
$$;

create or replace function public.assert_finance_settings_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('app.finance_write', true) = '1' then
    return new;
  end if;

  if tg_op = 'INSERT'
    and not public.is_platform_owner()
    and (
      new.default_platform_share_percentage is not null
      or coalesce(new.monthly_platform_fee, 200) <> 200
      or coalesce(new.platform_share_payment_due_days, 10) <> 10
    )
  then
    raise exception 'Only platform owners can change platform payment settings.';
  end if;

  if tg_op = 'UPDATE'
    and not public.is_platform_owner()
    and (
      new.default_platform_share_percentage is distinct from old.default_platform_share_percentage
      or new.monthly_platform_fee is distinct from old.monthly_platform_fee
      or new.platform_share_payment_due_days is distinct from old.platform_share_payment_due_days
    )
  then
    raise exception 'Only platform owners can change platform payment settings.';
  end if;

  if not (public.is_platform_owner() or public.is_organization_admin(new.organization_id)) then
    raise exception 'Only organization admins can manage finance settings.';
  end if;

  return new;
end;
$$;

create or replace function public.assert_finance_category_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('app.finance_write', true) = '1' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.created_by is distinct from old.created_by
      or (old.is_system = true and new.is_system is distinct from old.is_system)
    then
      raise exception 'Cannot update protected finance category fields.';
    end if;

    if not public.is_platform_owner()
      and new.eligible_for_platform_share_deduction is distinct from old.eligible_for_platform_share_deduction
    then
      raise exception 'Only platform owners can change platform payment deduction eligibility.';
    end if;
  end if;

  if not (public.is_platform_owner() or public.is_organization_admin(new.organization_id)) then
    raise exception 'Only organization admins can manage finance categories.';
  end if;

  return new;
end;
$$;

select set_config('app.finance_write', '1', true);

update public.organization_finance_settings
set
  monthly_platform_fee = coalesce(monthly_platform_fee, 200),
  default_platform_share_percentage = 0,
  updated_at = now();

create or replace function public.seed_standard_finance_categories(target_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org_row public.organizations;
  inserted_count integer := 0;
  category_specs jsonb := '[
    {"code":"order_income","type":"income","name":"Доход от заказов","profit":true,"cash":true,"deduct":false,"sort":10},
    {"code":"manual_income","type":"income","name":"Ручной доход","profit":true,"cash":true,"deduct":false,"sort":20},
    {"code":"purchase_goods","type":"expense","name":"Закупка товаров","profit":false,"cash":true,"deduct":false,"sort":30},
    {"code":"rent","type":"expense","name":"Аренда","profit":true,"cash":true,"deduct":true,"sort":40},
    {"code":"salary","type":"expense","name":"Зарплата","profit":true,"cash":true,"deduct":true,"sort":50},
    {"code":"utilities","type":"expense","name":"Коммунальные расходы","profit":true,"cash":true,"deduct":true,"sort":60},
    {"code":"marketing","type":"expense","name":"Маркетинг","profit":true,"cash":true,"deduct":true,"sort":70},
    {"code":"platform_share","type":"platform_share_accrual","name":"Ежемесячная оплата Freedom Platform","profit":false,"cash":false,"deduct":false,"sort":90},
    {"code":"platform_share_payment","type":"platform_share_payment","name":"Оплата Freedom Platform","profit":false,"cash":true,"deduct":false,"sort":100}
  ]'::jsonb;
  spec jsonb;
begin
  for org_row in
    select * from public.organizations
    where target_organization_id is null or id = target_organization_id
  loop
    if not (public.is_platform_owner() or public.is_organization_admin(org_row.id)) then
      continue;
    end if;

    perform set_config('app.finance_write', '1', true);

    insert into public.organization_finance_settings (
      organization_id,
      reporting_currency_code
    )
    values (org_row.id, org_row.currency_code)
    on conflict (organization_id) do nothing;

    for spec in select * from jsonb_array_elements(category_specs)
    loop
      insert into public.finance_categories (
        organization_id,
        transaction_type,
        name,
        system_code,
        affects_profit,
        affects_cash_flow,
        eligible_for_platform_share_deduction,
        sort_order,
        is_system,
        created_by
      )
      values (
        org_row.id,
        (spec ->> 'type')::public.finance_transaction_type,
        spec ->> 'name',
        spec ->> 'code',
        (spec ->> 'profit')::boolean,
        (spec ->> 'cash')::boolean,
        (spec ->> 'deduct')::boolean,
        (spec ->> 'sort')::integer,
        true,
        auth.uid()
      )
      on conflict (organization_id, system_code) where system_code is not null do update
      set
        name = excluded.name,
        transaction_type = excluded.transaction_type,
        affects_profit = excluded.affects_profit,
        affects_cash_flow = excluded.affects_cash_flow,
        sort_order = excluded.sort_order,
        updated_at = now();

      inserted_count := inserted_count + 1;
    end loop;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.calculate_financial_period(
  target_organization_id uuid,
  target_period_start date,
  target_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  revenue numeric(14,2);
  manual_income numeric(14,2);
  cogs numeric(14,2);
  operating_expenses numeric(14,2);
  cash_inflow numeric(14,2);
  cash_outflow numeric(14,2);
  gross_profit numeric(14,2);
  net_profit numeric(14,2);
  fixed_platform_fee numeric(14,2);
begin
  if target_period_end < target_period_start then raise exception 'Period end cannot be before period start.'; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(target_organization_id)) then
    raise exception 'You do not have access to this financial period.';
  end if;

  select coalesce(sum(ft.amount), 0)::numeric(14,2)
  into revenue
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.status in ('paid', 'partial')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ft.amount), 0)::numeric(14,2)
  into manual_income
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.source_type = 'manual'
    and ft.status in ('paid', 'partial')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ofs.cogs), 0)::numeric(14,2)
  into cogs
  from public.order_financial_summary ofs
  where ofs.organization_id = target_organization_id
    and ofs.business_date between target_period_start and target_period_end;

  select coalesce(sum(ft.amount), 0)::numeric(14,2)
  into operating_expenses
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'expense'
    and ft.affects_profit = true
    and ft.status <> 'cancelled'
    and ft.expense_approval_status not in ('pending', 'rejected')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ft.paid_amount), 0)::numeric(14,2)
  into cash_inflow
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.affects_cash_flow = true
    and ft.status in ('paid', 'partial')
    and ft.paid_date between target_period_start and target_period_end;

  select coalesce(sum(ft.paid_amount), 0)::numeric(14,2)
  into cash_outflow
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type in ('expense', 'purchase', 'platform_share_payment')
    and ft.affects_cash_flow = true
    and ft.status in ('paid', 'partial')
    and ft.paid_date between target_period_start and target_period_end;

  gross_profit := revenue - cogs;
  net_profit := gross_profit - operating_expenses;
  fixed_platform_fee := public.get_monthly_platform_fee(target_organization_id, target_period_end);

  return jsonb_build_object(
    'organization_id', target_organization_id,
    'period_start', target_period_start,
    'period_end', target_period_end,
    'revenue', revenue,
    'cogs', cogs,
    'gross_profit', gross_profit,
    'operating_expenses', operating_expenses,
    'other_income', manual_income,
    'net_profit_before_platform_share', net_profit,
    'platform_share_percentage', 0,
    'platform_share_amount', fixed_platform_fee,
    'organization_owner_amount', net_profit - fixed_platform_fee,
    'cash_inflow', cash_inflow,
    'cash_outflow', cash_outflow
  );
end;
$$;

create or replace function public.review_financial_period(
  target_period_id uuid,
  target_decision text,
  target_comment text default null
)
returns public.financial_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row public.financial_periods;
  settings_row public.organization_finance_settings;
  due_days integer := 10;
  accrual_row public.platform_share_accruals;
  category_id uuid;
begin
  if not public.is_platform_owner() then raise exception 'Only platform owners can review financial periods.'; end if;
  if target_decision not in ('approved', 'clarification_requested', 'rejected') then
    raise exception 'Decision must be approved, clarification_requested, or rejected.';
  end if;

  select * into period_row from public.financial_periods where id = target_period_id for update;
  if period_row.id is null then raise exception 'Financial period was not found.'; end if;
  if period_row.status = 'locked' then raise exception 'Locked financial period cannot be reviewed.'; end if;

  perform set_config('app.finance_write', '1', true);

  if target_decision = 'approved' then
    update public.financial_periods
    set
      status = 'locked',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_comment = target_comment,
      locked_at = now(),
      updated_at = now()
    where id = target_period_id
    returning * into period_row;

    select * into settings_row from public.organization_finance_settings where organization_id = period_row.organization_id;
    due_days := coalesce(settings_row.platform_share_payment_due_days, 10);

    insert into public.platform_share_accruals (
      organization_id,
      financial_period_id,
      percentage_snapshot,
      net_profit_snapshot,
      accrued_amount,
      paid_amount,
      status,
      due_date,
      approved_at
    )
    values (
      period_row.organization_id,
      period_row.id,
      0,
      period_row.net_profit_before_platform_share,
      period_row.platform_share_amount,
      0,
      case when period_row.platform_share_amount > 0 then 'approved'::public.platform_share_status else 'paid'::public.platform_share_status end,
      period_row.period_end + due_days,
      now()
    )
    on conflict (financial_period_id) do update
    set
      percentage_snapshot = 0,
      net_profit_snapshot = excluded.net_profit_snapshot,
      accrued_amount = excluded.accrued_amount,
      status = case when public.platform_share_accruals.paid_amount >= excluded.accrued_amount then 'paid'::public.platform_share_status else excluded.status end,
      due_date = excluded.due_date,
      approved_at = excluded.approved_at,
      updated_at = now()
    returning * into accrual_row;

    perform public.seed_standard_finance_categories(period_row.organization_id);
    select id into category_id from public.finance_categories where organization_id = period_row.organization_id and system_code = 'platform_share' limit 1;

    if period_row.platform_share_amount > 0 then
      insert into public.finance_transactions (
        organization_id,
        transaction_type,
        category_id,
        source_type,
        source_id,
        title,
        amount,
        paid_amount,
        status,
        accrual_date,
        affects_profit,
        affects_cash_flow,
        eligible_for_platform_share_deduction,
        created_by
      )
      values (
        period_row.organization_id,
        'platform_share_accrual',
        category_id,
        'platform_share',
        accrual_row.id,
        'Ежемесячная оплата Freedom Platform за период ' || period_row.period_start::text || ' - ' || period_row.period_end::text,
        period_row.platform_share_amount,
        0,
        'pending',
        period_row.period_end,
        false,
        false,
        false,
        auth.uid()
      )
      on conflict do nothing;
    end if;
  else
    update public.financial_periods
    set
      status = case when target_decision = 'rejected' then 'rejected'::public.financial_period_status else 'clarification_requested'::public.financial_period_status end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_comment = target_comment,
      updated_at = now()
    where id = target_period_id
    returning * into period_row;
  end if;

  perform public.finance_log(period_row.organization_id, 'finance.period_' || target_decision, 'financial_period', period_row.id, null, to_jsonb(period_row), target_comment);
  perform public.create_notification_outbox(
    period_row.organization_id,
    'custom',
    'financial_period',
    period_row.id,
    jsonb_build_object('event', 'financial_period_' || target_decision, 'period', to_jsonb(period_row), 'comment', target_comment),
    'financial_period_review:' || period_row.id::text || ':' || target_decision || ':' || extract(epoch from now())::text
  );

  return period_row;
end;
$$;

update public.financial_periods fp
set
  platform_share_percentage = 0,
  platform_share_amount = public.get_monthly_platform_fee(fp.organization_id, fp.period_end),
  organization_owner_amount = fp.net_profit_before_platform_share - public.get_monthly_platform_fee(fp.organization_id, fp.period_end),
  updated_at = now()
where fp.status <> 'locked';

create or replace function public.set_monthly_platform_fee(
  target_organization_id uuid,
  target_amount numeric,
  target_comment text default null
)
returns public.organization_finance_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.organization_finance_settings;
begin
  if not public.is_platform_owner() then raise exception 'Only platform owners can set monthly platform fee.'; end if;
  if target_amount < 0 then raise exception 'Monthly platform fee cannot be negative.'; end if;

  perform set_config('app.finance_write', '1', true);

  insert into public.organization_finance_settings (
    organization_id,
    monthly_platform_fee,
    default_platform_share_percentage
  )
  values (target_organization_id, target_amount, 0)
  on conflict (organization_id) do update
  set
    monthly_platform_fee = excluded.monthly_platform_fee,
    default_platform_share_percentage = 0,
    updated_at = now()
  returning * into settings_row;

  perform public.finance_log(target_organization_id, 'finance.monthly_platform_fee_set', 'organization_finance_settings', target_organization_id, null, to_jsonb(settings_row), target_comment);
  return settings_row;
end;
$$;

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
  select public.get_monthly_platform_fee(target_organization_id, current_date) >= 0 into has_share_rate;
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
  if not has_share_rate then warning_list := array_append(warning_list, 'monthly_platform_fee'); end if;
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

update public.finance_categories
set name = 'Ежемесячная оплата Freedom Platform'
where system_code = 'platform_share';

update public.finance_categories
set name = 'Оплата Freedom Platform'
where system_code = 'platform_share_payment';

grant execute on function public.get_monthly_platform_fee(uuid, date) to authenticated;
grant execute on function public.set_monthly_platform_fee(uuid, numeric, text) to authenticated;
