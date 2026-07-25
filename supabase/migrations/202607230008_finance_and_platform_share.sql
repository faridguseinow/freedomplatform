-- Organization finance, P&L, cash flow, and Freedom Platform share.
-- No secrets, service-role keys, real emails, passwords, or destructive operations are stored here.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'finance_transaction_type') then
    create type public.finance_transaction_type as enum (
      'income',
      'expense',
      'purchase',
      'platform_share_accrual',
      'platform_share_payment',
      'adjustment'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'finance_transaction_status') then
    create type public.finance_transaction_status as enum ('planned', 'pending', 'paid', 'partial', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'finance_payment_method') then
    create type public.finance_payment_method as enum ('cash', 'card_transfer', 'bank_transfer', 'other');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'finance_source_type') then
    create type public.finance_source_type as enum (
      'order',
      'manual',
      'stock_document',
      'recurring_expense',
      'platform_share',
      'adjustment'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'financial_period_status') then
    create type public.financial_period_status as enum (
      'open',
      'submitted',
      'clarification_requested',
      'approved',
      'locked',
      'rejected'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'platform_share_status') then
    create type public.platform_share_status as enum (
      'accumulating',
      'pending_approval',
      'approved',
      'partially_paid',
      'paid',
      'overdue',
      'disputed'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'recurring_frequency') then
    create type public.recurring_frequency as enum ('weekly', 'monthly', 'quarterly', 'yearly');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'expense_approval_status') then
    create type public.expense_approval_status as enum ('not_required', 'pending', 'approved', 'rejected');
  end if;
end
$$;

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_type public.finance_transaction_type not null,
  name text not null,
  description text,
  system_code text,
  affects_profit boolean not null default true,
  affects_cash_flow boolean not null default true,
  eligible_for_platform_share_deduction boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_categories_name_check check (length(btrim(name)) > 0),
  constraint finance_categories_sort_check check (sort_order >= 0)
);

create unique index if not exists finance_categories_org_system_code_key
on public.finance_categories (organization_id, system_code)
where system_code is not null;
create index if not exists finance_categories_organization_idx on public.finance_categories (organization_id);
create index if not exists finance_categories_type_idx on public.finance_categories (organization_id, transaction_type);

create table if not exists public.organization_finance_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  large_expense_threshold numeric(14,2),
  require_large_expense_approval boolean not null default false,
  default_platform_share_percentage numeric(7,4),
  reporting_currency_code text,
  financial_month_close_day integer,
  platform_share_payment_due_days integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_finance_settings_threshold_check check (large_expense_threshold is null or large_expense_threshold >= 0),
  constraint organization_finance_settings_share_check check (default_platform_share_percentage is null or (default_platform_share_percentage >= 0 and default_platform_share_percentage <= 100)),
  constraint organization_finance_settings_close_day_check check (financial_month_close_day is null or financial_month_close_day between 1 and 28),
  constraint organization_finance_settings_due_days_check check (platform_share_payment_due_days >= 0)
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_type public.finance_transaction_type not null,
  category_id uuid references public.finance_categories(id) on delete set null,
  source_type public.finance_source_type not null,
  source_id uuid,
  title text not null,
  description text,
  amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,
  status public.finance_transaction_status not null default 'pending',
  payment_method public.finance_payment_method,
  accrual_date date not null,
  paid_date date,
  recipient_or_supplier text,
  reference text,
  document_path text,
  affects_profit boolean not null default true,
  affects_cash_flow boolean not null default true,
  eligible_for_platform_share_deduction boolean not null default true,
  expense_approval_status public.expense_approval_status not null default 'not_required',
  approval_requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid not null references auth.users(id),
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_transactions_amount_check check (amount > 0 and paid_amount >= 0 and paid_amount <= amount),
  constraint finance_transactions_paid_check check (status <> 'paid' or paid_amount = amount),
  constraint finance_transactions_partial_check check (status <> 'partial' or (paid_amount > 0 and paid_amount < amount)),
  constraint finance_transactions_paid_date_check check (paid_amount = 0 or paid_date is not null),
  constraint finance_transactions_cancel_reason_check check (status <> 'cancelled' or length(btrim(coalesce(cancellation_reason, ''))) > 0),
  constraint finance_transactions_title_check check (length(btrim(title)) > 0)
);

create unique index if not exists finance_transactions_order_income_unique_idx
on public.finance_transactions (organization_id, source_type, source_id)
where source_type = 'order' and transaction_type = 'income' and source_id is not null;
create unique index if not exists finance_transactions_purchase_unique_idx
on public.finance_transactions (organization_id, source_type, source_id)
where source_type = 'stock_document' and transaction_type = 'purchase' and source_id is not null;
create index if not exists finance_transactions_organization_idx on public.finance_transactions (organization_id);
create index if not exists finance_transactions_type_idx on public.finance_transactions (organization_id, transaction_type);
create index if not exists finance_transactions_status_idx on public.finance_transactions (organization_id, status);
create index if not exists finance_transactions_accrual_date_idx on public.finance_transactions (organization_id, accrual_date desc);
create index if not exists finance_transactions_paid_date_idx on public.finance_transactions (organization_id, paid_date desc);
create index if not exists finance_transactions_source_idx on public.finance_transactions (source_type, source_id);
create index if not exists finance_transactions_category_idx on public.finance_transactions (category_id);

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references public.finance_categories(id) on delete restrict,
  title text not null,
  amount numeric(14,2) not null,
  frequency public.recurring_frequency not null,
  start_date date not null,
  next_generation_date date not null,
  end_date date,
  payment_method public.finance_payment_method,
  recipient_or_supplier text,
  description text,
  affects_profit boolean not null default true,
  affects_cash_flow boolean not null default true,
  is_active boolean not null default true,
  last_generated_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_expenses_title_check check (length(btrim(title)) > 0),
  constraint recurring_expenses_amount_check check (amount > 0),
  constraint recurring_expenses_end_check check (end_date is null or end_date >= start_date)
);

create index if not exists recurring_expenses_organization_idx on public.recurring_expenses (organization_id);
create index if not exists recurring_expenses_next_generation_idx on public.recurring_expenses (organization_id, is_active, next_generation_date);

create table if not exists public.financial_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status public.financial_period_status not null default 'open',
  revenue numeric(14,2) not null default 0,
  cogs numeric(14,2) not null default 0,
  gross_profit numeric(14,2) not null default 0,
  operating_expenses numeric(14,2) not null default 0,
  other_income numeric(14,2) not null default 0,
  net_profit_before_platform_share numeric(14,2) not null default 0,
  platform_share_percentage numeric(7,4) not null default 0,
  platform_share_amount numeric(14,2) not null default 0,
  organization_owner_amount numeric(14,2) not null default 0,
  cash_inflow numeric(14,2) not null default 0,
  cash_outflow numeric(14,2) not null default 0,
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_comment text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_periods_unique_period unique (organization_id, period_start, period_end),
  constraint financial_periods_date_check check (period_end >= period_start),
  constraint financial_periods_amounts_check check (
    revenue >= 0 and cogs >= 0 and gross_profit >= -999999999999.99
    and operating_expenses >= 0 and other_income >= 0
    and platform_share_percentage >= 0 and platform_share_percentage <= 100
    and platform_share_amount >= 0 and cash_inflow >= 0 and cash_outflow >= 0
  )
);

create index if not exists financial_periods_organization_idx on public.financial_periods (organization_id);
create index if not exists financial_periods_status_idx on public.financial_periods (organization_id, status);
create index if not exists financial_periods_period_idx on public.financial_periods (organization_id, period_start desc, period_end desc);

create table if not exists public.organization_platform_share_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  percentage numeric(7,4) not null,
  effective_from date not null,
  effective_to date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  comment text,
  constraint platform_share_rates_percentage_check check (percentage >= 0 and percentage <= 100),
  constraint platform_share_rates_date_check check (effective_to is null or effective_to >= effective_from)
);

create index if not exists platform_share_rates_organization_idx on public.organization_platform_share_rates (organization_id, effective_from desc);

create table if not exists public.platform_share_accruals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  financial_period_id uuid not null unique references public.financial_periods(id) on delete cascade,
  percentage_snapshot numeric(7,4) not null,
  net_profit_snapshot numeric(14,2) not null,
  accrued_amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,
  outstanding_amount numeric(14,2) generated always as (accrued_amount - paid_amount) stored,
  status public.platform_share_status not null,
  due_date date,
  approved_at timestamptz,
  fully_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_share_accruals_amounts_check check (
    percentage_snapshot >= 0 and percentage_snapshot <= 100
    and accrued_amount >= 0 and paid_amount >= 0 and paid_amount <= accrued_amount
  )
);

create index if not exists platform_share_accruals_organization_idx on public.platform_share_accruals (organization_id);
create index if not exists platform_share_accruals_status_idx on public.platform_share_accruals (organization_id, status);

create table if not exists public.platform_share_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  accrual_id uuid not null references public.platform_share_accruals(id) on delete cascade,
  amount numeric(14,2) not null,
  payment_method public.finance_payment_method,
  payment_date date not null,
  reference text,
  document_path text,
  marked_sent_by uuid references auth.users(id),
  confirmed_received_by uuid references auth.users(id),
  marked_sent_at timestamptz,
  confirmed_received_at timestamptz,
  status text not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_share_payments_amount_check check (amount > 0),
  constraint platform_share_payments_status_check check (status in ('reported_sent', 'confirmed', 'rejected'))
);

create index if not exists platform_share_payments_organization_idx on public.platform_share_payments (organization_id);
create index if not exists platform_share_payments_accrual_idx on public.platform_share_payments (accrual_id);
create index if not exists platform_share_payments_status_idx on public.platform_share_payments (organization_id, status);

create table if not exists public.finance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now(),
  constraint finance_audit_action_check check (length(btrim(action)) > 0),
  constraint finance_audit_entity_type_check check (length(btrim(entity_type)) > 0)
);

create index if not exists finance_audit_organization_idx on public.finance_audit_logs (organization_id);
create index if not exists finance_audit_entity_idx on public.finance_audit_logs (entity_type, entity_id);
create index if not exists finance_audit_created_idx on public.finance_audit_logs (created_at desc);

create or replace function public.finance_log(
  target_organization_id uuid,
  target_action text,
  target_entity_type text,
  target_entity_id uuid,
  target_before jsonb default null,
  target_after jsonb default null,
  target_reason text default null
)
returns public.finance_audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  log_row public.finance_audit_logs;
begin
  insert into public.finance_audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    reason
  )
  values (
    target_organization_id,
    auth.uid(),
    target_action,
    target_entity_type,
    target_entity_id,
    target_before,
    target_after,
    target_reason
  )
  returning * into log_row;

  return log_row;
end;
$$;

create or replace function public.prevent_finance_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Physical delete is not allowed for finance records.';
  end if;

  if auth.role() = 'service_role' then
    return coalesce(new, old);
  end if;

  if current_setting('app.finance_write', true) <> '1' then
    raise exception 'Finance records can be changed only through finance RPC functions.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_locked_finance_transaction_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and exists (
    select 1
    from public.financial_periods fp
    where fp.organization_id = old.organization_id
      and fp.status = 'locked'
      and old.accrual_date between fp.period_start and fp.period_end
  ) then
    raise exception 'Transactions in locked financial periods cannot be edited.';
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
      raise exception 'Only platform owners can change platform share deduction eligibility.';
    end if;
  end if;

  if not (public.is_platform_owner() or public.is_organization_admin(new.organization_id)) then
    raise exception 'Only organization admins can manage finance categories.';
  end if;

  return new;
end;
$$;

create or replace function public.assert_finance_transaction_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  category_row public.finance_categories;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.source_type is distinct from old.source_type
      or new.source_id is distinct from old.source_id
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Cannot update protected finance transaction fields.';
    end if;
  end if;

  if new.category_id is not null then
    select * into category_row from public.finance_categories where id = new.category_id;
    if category_row.id is null or category_row.organization_id <> new.organization_id then
      raise exception 'Finance category does not belong to this organization.';
    end if;

    if new.transaction_type <> category_row.transaction_type
      and not (new.transaction_type = 'purchase' and category_row.transaction_type = 'expense')
    then
      raise exception 'Finance category type does not match transaction type.';
    end if;
  end if;

  if new.source_type = 'order' and new.source_id is not null and not exists (
    select 1 from public.orders o where o.id = new.source_id and o.organization_id = new.organization_id
  ) then
    raise exception 'Order source does not belong to this organization.';
  end if;

  if new.source_type = 'stock_document' and new.source_id is not null and not exists (
    select 1 from public.stock_documents sd where sd.id = new.source_id and sd.organization_id = new.organization_id
  ) then
    raise exception 'Stock document source does not belong to this organization.';
  end if;

  return new;
end;
$$;

create or replace function public.assert_finance_settings_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and not public.is_platform_owner()
    and (
      new.default_platform_share_percentage is distinct from old.default_platform_share_percentage
      or new.platform_share_payment_due_days is distinct from old.platform_share_payment_due_days
    )
  then
    raise exception 'Only platform owners can change platform share settings.';
  end if;

  if not (public.is_platform_owner() or public.is_organization_admin(new.organization_id)) then
    raise exception 'Only organization admins can manage finance settings.';
  end if;

  return new;
end;
$$;

create or replace function public.assert_recurring_expense_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  category_row public.finance_categories;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Cannot update protected recurring expense fields.';
    end if;
  end if;

  select * into category_row from public.finance_categories where id = new.category_id;
  if category_row.id is null
    or category_row.organization_id <> new.organization_id
    or category_row.transaction_type <> 'expense'
  then
    raise exception 'Recurring expense category must be an expense category from this organization.';
  end if;

  if not public.is_organization_admin(new.organization_id) then
    raise exception 'Only organization admins can manage recurring expenses.';
  end if;

  return new;
end;
$$;

drop trigger if exists finance_categories_updated_at on public.finance_categories;
create trigger finance_categories_updated_at before update on public.finance_categories
for each row execute function public.set_updated_at();
drop trigger if exists finance_settings_updated_at on public.organization_finance_settings;
create trigger finance_settings_updated_at before update on public.organization_finance_settings
for each row execute function public.set_updated_at();
drop trigger if exists finance_transactions_updated_at on public.finance_transactions;
create trigger finance_transactions_updated_at before update on public.finance_transactions
for each row execute function public.set_updated_at();
drop trigger if exists recurring_expenses_updated_at on public.recurring_expenses;
create trigger recurring_expenses_updated_at before update on public.recurring_expenses
for each row execute function public.set_updated_at();
drop trigger if exists financial_periods_updated_at on public.financial_periods;
create trigger financial_periods_updated_at before update on public.financial_periods
for each row execute function public.set_updated_at();
drop trigger if exists platform_share_accruals_updated_at on public.platform_share_accruals;
create trigger platform_share_accruals_updated_at before update on public.platform_share_accruals
for each row execute function public.set_updated_at();
drop trigger if exists platform_share_payments_updated_at on public.platform_share_payments;
create trigger platform_share_payments_updated_at before update on public.platform_share_payments
for each row execute function public.set_updated_at();

drop trigger if exists finance_categories_scope on public.finance_categories;
create trigger finance_categories_scope before insert or update on public.finance_categories
for each row execute function public.assert_finance_category_scope();
drop trigger if exists finance_settings_scope on public.organization_finance_settings;
create trigger finance_settings_scope before insert or update on public.organization_finance_settings
for each row execute function public.assert_finance_settings_scope();
drop trigger if exists finance_transactions_scope on public.finance_transactions;
create trigger finance_transactions_scope before insert or update on public.finance_transactions
for each row execute function public.assert_finance_transaction_scope();
drop trigger if exists finance_transactions_locked_guard on public.finance_transactions;
create trigger finance_transactions_locked_guard before update on public.finance_transactions
for each row execute function public.prevent_locked_finance_transaction_update();
drop trigger if exists recurring_expenses_scope on public.recurring_expenses;
create trigger recurring_expenses_scope before insert or update on public.recurring_expenses
for each row execute function public.assert_recurring_expense_scope();

drop trigger if exists finance_transactions_direct_write_guard on public.finance_transactions;
create trigger finance_transactions_direct_write_guard before insert or update or delete on public.finance_transactions
for each row execute function public.prevent_finance_direct_write();
drop trigger if exists financial_periods_direct_write_guard on public.financial_periods;
create trigger financial_periods_direct_write_guard before insert or update or delete on public.financial_periods
for each row execute function public.prevent_finance_direct_write();
drop trigger if exists platform_share_rates_direct_write_guard on public.organization_platform_share_rates;
create trigger platform_share_rates_direct_write_guard before insert or update or delete on public.organization_platform_share_rates
for each row execute function public.prevent_finance_direct_write();
drop trigger if exists platform_share_accruals_direct_write_guard on public.platform_share_accruals;
create trigger platform_share_accruals_direct_write_guard before insert or update or delete on public.platform_share_accruals
for each row execute function public.prevent_finance_direct_write();
drop trigger if exists platform_share_payments_direct_write_guard on public.platform_share_payments;
create trigger platform_share_payments_direct_write_guard before insert or update or delete on public.platform_share_payments
for each row execute function public.prevent_finance_direct_write();
drop trigger if exists finance_audit_logs_direct_write_guard on public.finance_audit_logs;
create trigger finance_audit_logs_direct_write_guard before insert or update or delete on public.finance_audit_logs
for each row execute function public.prevent_finance_direct_write();

create or replace function public.finance_payment_method_from_order(target_method public.payment_method)
returns public.finance_payment_method
language sql
immutable
as $$
  select case
    when target_method = 'cash' then 'cash'::public.finance_payment_method
    when target_method = 'card_transfer' then 'card_transfer'::public.finance_payment_method
    else 'other'::public.finance_payment_method
  end;
$$;

create or replace function public.get_current_platform_share_rate(
  target_organization_id uuid,
  target_date date default current_date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select r.percentage
      from public.organization_platform_share_rates r
      where r.organization_id = target_organization_id
        and r.effective_from <= target_date
        and (r.effective_to is null or r.effective_to >= target_date)
      order by r.effective_from desc, r.created_at desc
      limit 1
    ),
    (
      select s.default_platform_share_percentage
      from public.organization_finance_settings s
      where s.organization_id = target_organization_id
    ),
    0
  )::numeric;
$$;

create or replace function public.calculate_order_cost(target_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case
      when oi.status <> 'active' then 0
      when oi.total_cost_snapshot is not null then oi.total_cost_snapshot
      when oi.item_type = 'combo' then coalesce((
        select sum(coalesce(occ.unit_cost_snapshot, 0) * occ.quantity * oi.quantity)
        from public.order_combo_components occ
        where occ.order_item_id = oi.id
          and occ.component_type = 'product'
      ), 0)
      else coalesce(oi.unit_cost_snapshot, 0) * oi.quantity
    end
  ), 0)::numeric(14,2)
  from public.order_items oi
  where oi.order_id = target_order_id;
$$;

create or replace view public.order_financial_summary
with (security_barrier = true)
as
select
  o.organization_id,
  o.id as order_id,
  o.order_number,
  p.id as payment_id,
  p.method as order_payment_method,
  public.finance_payment_method_from_order(p.method) as finance_payment_method,
  p.completed_at as paid_at,
  public.get_business_date(o.organization_id, coalesce(p.completed_at, o.closed_at, o.updated_at)) as business_date,
  o.total_amount::numeric(14,2) as revenue,
  public.calculate_order_cost(o.id)::numeric(14,2) as cogs,
  (o.total_amount - public.calculate_order_cost(o.id))::numeric(14,2) as gross_profit,
  o.closed_shift_id,
  es.operational_day_id
from public.orders o
join public.payments p on p.order_id = o.id and p.status = 'completed'
left join public.employee_shifts es on es.id = o.closed_shift_id
where o.status = 'paid'
  and (public.is_platform_owner() or public.is_organization_admin(o.organization_id));

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
    {"code":"platform_share","type":"platform_share_accrual","name":"Доля Freedom Platform","profit":false,"cash":false,"deduct":false,"sort":90},
    {"code":"platform_share_payment","type":"platform_share_payment","name":"Оплата доли Freedom Platform","profit":false,"cash":true,"deduct":false,"sort":100}
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

create or replace function public.sync_order_income(target_order_id uuid)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  payment_row public.payments;
  category_id uuid;
  transaction_row public.finance_transactions;
  business_date date;
begin
  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status <> 'paid' then return null; end if;

  select * into payment_row
  from public.payments
  where order_id = order_row.id and status = 'completed'
  order by completed_at desc nulls last, created_at desc
  limit 1;

  if payment_row.id is null then return null; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(order_row.organization_id) or public.can_work_with_orders(order_row.organization_id)) then
    raise exception 'You do not have access to this order.';
  end if;

  perform public.seed_standard_finance_categories(order_row.organization_id);

  select id into category_id
  from public.finance_categories
  where organization_id = order_row.organization_id and system_code = 'order_income'
  limit 1;

  business_date := public.get_business_date(order_row.organization_id, coalesce(payment_row.completed_at, now()));
  perform set_config('app.finance_write', '1', true);

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
    payment_method,
    accrual_date,
    paid_date,
    reference,
    affects_profit,
    affects_cash_flow,
    eligible_for_platform_share_deduction,
    created_by
  )
  values (
    order_row.organization_id,
    'income',
    category_id,
    'order',
    order_row.id,
    'Заказ #' || order_row.order_number::text,
    payment_row.amount,
    payment_row.amount,
    'paid',
    public.finance_payment_method_from_order(payment_row.method),
    business_date,
    business_date,
    payment_row.id::text,
    true,
    true,
    false,
    coalesce(payment_row.received_by, order_row.closed_by, order_row.opened_by)
  )
  on conflict (organization_id, source_type, source_id)
  where source_type = 'order' and transaction_type = 'income' and source_id is not null
  do update set
    amount = excluded.amount,
    paid_amount = excluded.paid_amount,
    status = excluded.status,
    payment_method = excluded.payment_method,
    accrual_date = excluded.accrual_date,
    paid_date = excluded.paid_date,
    reference = excluded.reference,
    updated_at = now()
  returning * into transaction_row;

  perform public.finance_log(order_row.organization_id, 'finance.order_income_synced', 'finance_transaction', transaction_row.id, null, to_jsonb(transaction_row));
  return transaction_row;
end;
$$;

create or replace function public.create_purchase_finance_transaction(target_document_id uuid)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.stock_documents;
  category_id uuid;
  calculated_amount numeric(14,2);
  transaction_row public.finance_transactions;
  business_date date;
begin
  select * into document_row from public.stock_documents where id = target_document_id for update;
  if document_row.id is null then raise exception 'Stock document was not found.'; end if;
  if document_row.status <> 'posted' or document_row.type <> 'purchase' then return null; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(document_row.organization_id)) then
    raise exception 'Only organization admins can sync purchase finance transactions.';
  end if;

  perform public.seed_standard_finance_categories(document_row.organization_id);

  select id into category_id
  from public.finance_categories
  where organization_id = document_row.organization_id and system_code = 'purchase_goods'
  limit 1;

  select coalesce(document_row.total_amount, sum(coalesce(sdi.line_total, sdi.quantity * coalesce(sdi.unit_cost, 0))), 0)::numeric(14,2)
  into calculated_amount
  from public.stock_document_items sdi
  where sdi.document_id = document_row.id;

  if calculated_amount <= 0 then return null; end if;

  business_date := public.get_business_date(document_row.organization_id, coalesce(document_row.posted_at, document_row.document_date, now()));
  perform set_config('app.finance_write', '1', true);

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
    recipient_or_supplier,
    reference,
    affects_profit,
    affects_cash_flow,
    eligible_for_platform_share_deduction,
    created_by
  )
  values (
    document_row.organization_id,
    'purchase',
    category_id,
    'stock_document',
    document_row.id,
    'Закупка #' || document_row.document_number::text,
    calculated_amount,
    0,
    'pending',
    business_date,
    document_row.supplier_name,
    document_row.reference,
    false,
    true,
    false,
    coalesce(document_row.posted_by, document_row.created_by)
  )
  on conflict (organization_id, source_type, source_id)
  where source_type = 'stock_document' and transaction_type = 'purchase' and source_id is not null
  do update set
    amount = excluded.amount,
    accrual_date = excluded.accrual_date,
    recipient_or_supplier = excluded.recipient_or_supplier,
    reference = excluded.reference,
    updated_at = now()
  returning * into transaction_row;

  perform public.finance_log(document_row.organization_id, 'finance.purchase_synced', 'finance_transaction', transaction_row.id, null, to_jsonb(transaction_row));
  return transaction_row;
end;
$$;

create or replace function public.create_manual_income(
  target_organization_id uuid,
  target_title text,
  target_amount numeric,
  target_payment_method public.finance_payment_method default null,
  target_accrual_date date default current_date,
  target_paid_date date default current_date,
  target_category_id uuid default null,
  target_description text default null,
  target_reference text default null
)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row public.finance_transactions;
begin
  if not public.is_organization_admin(target_organization_id) then raise exception 'Only organization admins can create manual income.'; end if;
  if target_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;

  perform public.seed_standard_finance_categories(target_organization_id);
  perform set_config('app.finance_write', '1', true);

  insert into public.finance_transactions (
    organization_id,
    transaction_type,
    category_id,
    source_type,
    title,
    description,
    amount,
    paid_amount,
    status,
    payment_method,
    accrual_date,
    paid_date,
    reference,
    created_by
  )
  values (
    target_organization_id,
    'income',
    target_category_id,
    'manual',
    target_title,
    target_description,
    target_amount,
    case when target_paid_date is null then 0 else target_amount end,
    case when target_paid_date is null then 'pending'::public.finance_transaction_status else 'paid'::public.finance_transaction_status end,
    target_payment_method,
    target_accrual_date,
    target_paid_date,
    target_reference,
    auth.uid()
  )
  returning * into transaction_row;

  perform public.finance_log(target_organization_id, 'finance.manual_income_created', 'finance_transaction', transaction_row.id, null, to_jsonb(transaction_row));
  return transaction_row;
end;
$$;

create or replace function public.create_expense(
  target_organization_id uuid,
  target_title text,
  target_amount numeric,
  target_category_id uuid,
  target_payment_method public.finance_payment_method default null,
  target_accrual_date date default current_date,
  target_paid_date date default null,
  target_recipient_or_supplier text default null,
  target_description text default null,
  target_document_path text default null,
  target_source_type public.finance_source_type default 'manual',
  target_source_id uuid default null
)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.organization_finance_settings;
  category_row public.finance_categories;
  approval_status public.expense_approval_status := 'not_required';
  transaction_status public.finance_transaction_status;
  paid_value numeric(14,2) := 0;
  transaction_row public.finance_transactions;
begin
  if not public.is_organization_admin(target_organization_id) then raise exception 'Only organization admins can create expenses.'; end if;
  if target_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;

  perform public.seed_standard_finance_categories(target_organization_id);

  select * into category_row from public.finance_categories where id = target_category_id;
  if category_row.id is null or category_row.organization_id <> target_organization_id or category_row.transaction_type <> 'expense' then
    raise exception 'Expense category is invalid.';
  end if;

  select * into settings_row from public.organization_finance_settings where organization_id = target_organization_id;
  if settings_row.require_large_expense_approval
    and settings_row.large_expense_threshold is not null
    and target_amount >= settings_row.large_expense_threshold
  then
    approval_status := 'pending';
  end if;

  if approval_status = 'pending' then
    transaction_status := 'pending';
  elsif target_paid_date is null then
    transaction_status := 'pending';
  else
    transaction_status := 'paid';
    paid_value := target_amount;
  end if;

  perform set_config('app.finance_write', '1', true);
  insert into public.finance_transactions (
    organization_id,
    transaction_type,
    category_id,
    source_type,
    source_id,
    title,
    description,
    amount,
    paid_amount,
    status,
    payment_method,
    accrual_date,
    paid_date,
    recipient_or_supplier,
    document_path,
    affects_profit,
    affects_cash_flow,
    eligible_for_platform_share_deduction,
    expense_approval_status,
    approval_requested_by,
    created_by
  )
  values (
    target_organization_id,
    'expense',
    target_category_id,
    target_source_type,
    target_source_id,
    target_title,
    target_description,
    target_amount,
    paid_value,
    transaction_status,
    target_payment_method,
    target_accrual_date,
    target_paid_date,
    target_recipient_or_supplier,
    target_document_path,
    category_row.affects_profit,
    category_row.affects_cash_flow,
    category_row.eligible_for_platform_share_deduction,
    approval_status,
    case when approval_status = 'pending' then auth.uid() else null end,
    auth.uid()
  )
  returning * into transaction_row;

  perform public.finance_log(target_organization_id, 'finance.expense_created', 'finance_transaction', transaction_row.id, null, to_jsonb(transaction_row));
  return transaction_row;
end;
$$;

create or replace function public.approve_expense(
  target_transaction_id uuid,
  target_decision text,
  target_comment text default null
)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row public.finance_transactions;
begin
  select * into transaction_row from public.finance_transactions where id = target_transaction_id for update;
  if transaction_row.id is null then raise exception 'Finance transaction was not found.'; end if;
  if not public.is_organization_admin(transaction_row.organization_id) then raise exception 'Only organization admins can approve expenses.'; end if;
  if transaction_row.transaction_type <> 'expense' or transaction_row.expense_approval_status <> 'pending' then
    raise exception 'Only pending expenses can be reviewed.';
  end if;
  if target_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected.'; end if;

  perform set_config('app.finance_write', '1', true);
  update public.finance_transactions
  set
    expense_approval_status = target_decision::public.expense_approval_status,
    approved_by = case when target_decision = 'approved' then auth.uid() else null end,
    approved_at = case when target_decision = 'approved' then now() else null end,
    status = case when target_decision = 'approved' then status else 'cancelled'::public.finance_transaction_status end,
    cancellation_reason = case when target_decision = 'rejected' then coalesce(target_comment, 'Expense rejected') else cancellation_reason end,
    cancelled_by = case when target_decision = 'rejected' then auth.uid() else cancelled_by end,
    cancelled_at = case when target_decision = 'rejected' then now() else cancelled_at end,
    updated_at = now()
  where id = target_transaction_id
  returning * into transaction_row;

  perform public.finance_log(transaction_row.organization_id, 'finance.expense_' || target_decision, 'finance_transaction', transaction_row.id, null, to_jsonb(transaction_row), target_comment);
  return transaction_row;
end;
$$;

create or replace function public.next_recurring_expense_date(target_date date, target_frequency public.recurring_frequency)
returns date
language sql
immutable
as $$
  select case target_frequency
    when 'weekly' then target_date + interval '1 week'
    when 'monthly' then target_date + interval '1 month'
    when 'quarterly' then target_date + interval '3 months'
    when 'yearly' then target_date + interval '1 year'
  end::date;
$$;

create or replace function public.generate_due_recurring_expenses(
  target_organization_id uuid,
  target_until_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  recurring_row public.recurring_expenses;
  generated_count integer := 0;
  generated_row public.finance_transactions;
begin
  if not public.is_organization_admin(target_organization_id) then raise exception 'Only organization admins can generate recurring expenses.'; end if;

  for recurring_row in
    select *
    from public.recurring_expenses
    where organization_id = target_organization_id
      and is_active = true
      and next_generation_date <= target_until_date
      and (end_date is null or next_generation_date <= end_date)
    order by next_generation_date asc
    for update
  loop
    generated_row := public.create_expense(
      recurring_row.organization_id,
      recurring_row.title,
      recurring_row.amount,
      recurring_row.category_id,
      recurring_row.payment_method,
      recurring_row.next_generation_date,
      null,
      recurring_row.recipient_or_supplier,
      recurring_row.description,
      null,
      'recurring_expense',
      recurring_row.id
    );

    update public.recurring_expenses
    set
      next_generation_date = public.next_recurring_expense_date(recurring_row.next_generation_date, recurring_row.frequency),
      last_generated_at = now(),
      updated_at = now()
    where id = recurring_row.id;

    generated_count := generated_count + 1;
  end loop;

  return generated_count;
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
  share_percentage numeric(7,4);
  share_amount numeric(14,2);
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
  share_percentage := public.get_current_platform_share_rate(target_organization_id, target_period_end);
  share_amount := greatest(net_profit, 0) * share_percentage / 100;

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
    'platform_share_percentage', share_percentage,
    'platform_share_amount', share_amount,
    'organization_owner_amount', net_profit - share_amount,
    'cash_inflow', cash_inflow,
    'cash_outflow', cash_outflow
  );
end;
$$;

create or replace function public.submit_financial_period(
  target_period_start date,
  target_period_end date
)
returns public.financial_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
  summary jsonb;
  period_row public.financial_periods;
begin
  target_organization_id := public.current_user_primary_organization_id();
  if target_organization_id is null then raise exception 'Organization was not found for current user.'; end if;
  if not public.is_organization_admin(target_organization_id) then raise exception 'Only organization admins can submit financial periods.'; end if;

  if exists (
    select 1
    from public.finance_transactions ft
    where ft.organization_id = target_organization_id
      and ft.transaction_type = 'expense'
      and ft.expense_approval_status = 'pending'
      and ft.accrual_date between target_period_start and target_period_end
  ) then
    raise exception 'Financial period has pending expense approvals.';
  end if;

  summary := public.calculate_financial_period(target_organization_id, target_period_start, target_period_end);
  perform set_config('app.finance_write', '1', true);

  insert into public.financial_periods (
    organization_id,
    period_start,
    period_end,
    status,
    revenue,
    cogs,
    gross_profit,
    operating_expenses,
    other_income,
    net_profit_before_platform_share,
    platform_share_percentage,
    platform_share_amount,
    organization_owner_amount,
    cash_inflow,
    cash_outflow,
    submitted_by,
    submitted_at
  )
  values (
    target_organization_id,
    target_period_start,
    target_period_end,
    'submitted',
    (summary ->> 'revenue')::numeric,
    (summary ->> 'cogs')::numeric,
    (summary ->> 'gross_profit')::numeric,
    (summary ->> 'operating_expenses')::numeric,
    (summary ->> 'other_income')::numeric,
    (summary ->> 'net_profit_before_platform_share')::numeric,
    (summary ->> 'platform_share_percentage')::numeric,
    (summary ->> 'platform_share_amount')::numeric,
    (summary ->> 'organization_owner_amount')::numeric,
    (summary ->> 'cash_inflow')::numeric,
    (summary ->> 'cash_outflow')::numeric,
    auth.uid(),
    now()
  )
  on conflict (organization_id, period_start, period_end) do update
  set
    status = case when public.financial_periods.status = 'locked' then public.financial_periods.status else 'submitted'::public.financial_period_status end,
    revenue = excluded.revenue,
    cogs = excluded.cogs,
    gross_profit = excluded.gross_profit,
    operating_expenses = excluded.operating_expenses,
    other_income = excluded.other_income,
    net_profit_before_platform_share = excluded.net_profit_before_platform_share,
    platform_share_percentage = excluded.platform_share_percentage,
    platform_share_amount = excluded.platform_share_amount,
    organization_owner_amount = excluded.organization_owner_amount,
    cash_inflow = excluded.cash_inflow,
    cash_outflow = excluded.cash_outflow,
    submitted_by = excluded.submitted_by,
    submitted_at = excluded.submitted_at,
    updated_at = now()
  returning * into period_row;

  if period_row.status = 'locked' then raise exception 'Locked financial period cannot be resubmitted.'; end if;

  perform public.finance_log(target_organization_id, 'finance.period_submitted', 'financial_period', period_row.id, null, to_jsonb(period_row));
  perform public.create_notification_outbox(
    target_organization_id,
    'custom',
    'financial_period',
    period_row.id,
    jsonb_build_object('event', 'financial_period_submitted', 'period', to_jsonb(period_row)),
    'financial_period_submitted:' || period_row.id::text || ':' || extract(epoch from period_row.submitted_at)::text
  );

  return period_row;
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
      period_row.platform_share_percentage,
      period_row.net_profit_before_platform_share,
      period_row.platform_share_amount,
      0,
      case when period_row.platform_share_amount > 0 then 'approved'::public.platform_share_status else 'paid'::public.platform_share_status end,
      period_row.period_end + due_days,
      now()
    )
    on conflict (financial_period_id) do update
    set
      percentage_snapshot = excluded.percentage_snapshot,
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
        'Доля Freedom Platform за период ' || period_row.period_start::text || ' - ' || period_row.period_end::text,
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

create or replace function public.set_platform_share_rate(
  target_organization_id uuid,
  target_percentage numeric,
  target_effective_from date,
  target_comment text default null
)
returns public.organization_platform_share_rates
language plpgsql
security definer
set search_path = public
as $$
declare
  rate_row public.organization_platform_share_rates;
begin
  if not public.is_platform_owner() then raise exception 'Only platform owners can set platform share rates.'; end if;
  if target_percentage < 0 or target_percentage > 100 then raise exception 'Percentage must be between 0 and 100.'; end if;

  perform set_config('app.finance_write', '1', true);

  update public.organization_platform_share_rates
  set effective_to = target_effective_from - 1
  where organization_id = target_organization_id
    and effective_to is null
    and effective_from < target_effective_from;

  insert into public.organization_platform_share_rates (
    organization_id,
    percentage,
    effective_from,
    created_by,
    comment
  )
  values (
    target_organization_id,
    target_percentage,
    target_effective_from,
    auth.uid(),
    target_comment
  )
  returning * into rate_row;

  insert into public.organization_finance_settings (
    organization_id,
    default_platform_share_percentage
  )
  values (target_organization_id, target_percentage)
  on conflict (organization_id) do update
  set default_platform_share_percentage = excluded.default_platform_share_percentage, updated_at = now();

  perform public.finance_log(target_organization_id, 'finance.platform_share_rate_set', 'organization_platform_share_rate', rate_row.id, null, to_jsonb(rate_row), target_comment);
  return rate_row;
end;
$$;

create or replace function public.report_platform_share_payment(
  target_accrual_id uuid,
  target_amount numeric,
  target_payment_method public.finance_payment_method,
  target_payment_date date,
  target_reference text default null,
  target_document_path text default null,
  target_comment text default null
)
returns public.platform_share_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  accrual_row public.platform_share_accruals;
  payment_row public.platform_share_payments;
begin
  select * into accrual_row from public.platform_share_accruals where id = target_accrual_id for update;
  if accrual_row.id is null then raise exception 'Platform share accrual was not found.'; end if;
  if not public.is_organization_admin(accrual_row.organization_id) then raise exception 'Only organization admins can report platform share payments.'; end if;
  if target_amount <= 0 or target_amount > accrual_row.outstanding_amount then raise exception 'Payment amount is invalid.'; end if;

  perform set_config('app.finance_write', '1', true);
  insert into public.platform_share_payments (
    organization_id,
    accrual_id,
    amount,
    payment_method,
    payment_date,
    reference,
    document_path,
    marked_sent_by,
    marked_sent_at,
    status,
    comment
  )
  values (
    accrual_row.organization_id,
    accrual_row.id,
    target_amount,
    target_payment_method,
    target_payment_date,
    target_reference,
    target_document_path,
    auth.uid(),
    now(),
    'reported_sent',
    target_comment
  )
  returning * into payment_row;

  update public.platform_share_accruals
  set status = case when status = 'paid' then status else 'pending_approval'::public.platform_share_status end,
      updated_at = now()
  where id = accrual_row.id;

  perform public.finance_log(accrual_row.organization_id, 'finance.platform_share_payment_reported', 'platform_share_payment', payment_row.id, null, to_jsonb(payment_row), target_comment);
  return payment_row;
end;
$$;

create or replace function public.confirm_platform_share_payment(
  target_payment_id uuid,
  target_decision text,
  target_comment text default null
)
returns public.platform_share_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.platform_share_payments;
  accrual_row public.platform_share_accruals;
  category_id uuid;
  new_paid_amount numeric(14,2);
begin
  if not public.is_platform_owner() then raise exception 'Only platform owners can confirm platform share payments.'; end if;
  if target_decision not in ('confirmed', 'rejected') then raise exception 'Decision must be confirmed or rejected.'; end if;

  select * into payment_row from public.platform_share_payments where id = target_payment_id for update;
  if payment_row.id is null then raise exception 'Platform share payment was not found.'; end if;
  if payment_row.status <> 'reported_sent' then raise exception 'Only reported payments can be reviewed.'; end if;
  select * into accrual_row from public.platform_share_accruals where id = payment_row.accrual_id for update;

  perform set_config('app.finance_write', '1', true);

  if target_decision = 'confirmed' then
    update public.platform_share_payments
    set
      status = 'confirmed',
      confirmed_received_by = auth.uid(),
      confirmed_received_at = now(),
      comment = coalesce(target_comment, comment),
      updated_at = now()
    where id = target_payment_id
    returning * into payment_row;

    new_paid_amount := accrual_row.paid_amount + payment_row.amount;
    update public.platform_share_accruals
    set
      paid_amount = new_paid_amount,
      status = case
        when new_paid_amount >= accrued_amount then 'paid'::public.platform_share_status
        when new_paid_amount > 0 then 'partially_paid'::public.platform_share_status
        else 'approved'::public.platform_share_status
      end,
      fully_paid_at = case when new_paid_amount >= accrued_amount then now() else null end,
      updated_at = now()
    where id = accrual_row.id
    returning * into accrual_row;

    perform public.seed_standard_finance_categories(accrual_row.organization_id);
    select id into category_id from public.finance_categories where organization_id = accrual_row.organization_id and system_code = 'platform_share_payment' limit 1;

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
      payment_method,
      accrual_date,
      paid_date,
      reference,
      document_path,
      affects_profit,
      affects_cash_flow,
      eligible_for_platform_share_deduction,
      created_by
    )
    values (
      accrual_row.organization_id,
      'platform_share_payment',
      category_id,
      'platform_share',
      payment_row.id,
      'Оплата доли Freedom Platform',
      payment_row.amount,
      payment_row.amount,
      'paid',
      payment_row.payment_method,
      payment_row.payment_date,
      payment_row.payment_date,
      payment_row.reference,
      payment_row.document_path,
      false,
      true,
      false,
      auth.uid()
    );
  else
    update public.platform_share_payments
    set
      status = 'rejected',
      confirmed_received_by = auth.uid(),
      confirmed_received_at = now(),
      comment = coalesce(target_comment, comment),
      updated_at = now()
    where id = target_payment_id
    returning * into payment_row;
  end if;

  perform public.finance_log(payment_row.organization_id, 'finance.platform_share_payment_' || target_decision, 'platform_share_payment', payment_row.id, null, to_jsonb(payment_row), target_comment);
  return payment_row;
end;
$$;

create or replace function public.post_stock_document(target_document_id uuid)
returns public.stock_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.stock_documents;
  item_row public.stock_document_items;
  sign integer;
  next_quantity numeric(14,3);
begin
  select * into document_row from public.stock_documents where id = target_document_id;
  if document_row.id is null then raise exception 'Stock document was not found.'; end if;
  if document_row.status <> 'draft' then raise exception 'Only draft documents can be posted.'; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(document_row.organization_id)) then
    raise exception 'Only organization admins can post stock documents.';
  end if;
  if not exists (select 1 from public.organizations o where o.id = document_row.organization_id and o.status = 'active') then
    raise exception 'Organization is not active.';
  end if;

  sign := public.inventory_quantity_sign(document_row.type);
  if sign = 0 then raise exception 'This stock document type is not postable at this stage.'; end if;

  if not exists (select 1 from public.stock_document_items where document_id = target_document_id) then
    raise exception 'Document must contain at least one item.';
  end if;

  perform set_config('app.inventory_write', '1', true);

  for item_row in
    select * from public.stock_document_items where document_id = target_document_id order by created_at asc
  loop
    if not exists (select 1 from public.products p where p.id = item_row.product_id and p.organization_id = document_row.organization_id and p.track_stock = true) then
      raise exception 'Document item product does not belong to this organization.';
    end if;

    next_quantity := public.calculate_product_stock(item_row.product_id) + (item_row.quantity * sign);
    if next_quantity < 0 then
      raise exception 'Stock cannot become negative.';
    end if;

    insert into public.stock_movements (
      organization_id,
      product_id,
      document_id,
      document_item_id,
      movement_type,
      quantity_delta,
      unit_cost,
      total_cost,
      reference_type,
      reference_id,
      comment,
      created_by
    )
    values (
      document_row.organization_id,
      item_row.product_id,
      document_row.id,
      item_row.id,
      document_row.type,
      item_row.quantity * sign,
      item_row.unit_cost,
      coalesce(item_row.line_total, item_row.quantity * coalesce(item_row.unit_cost, 0)),
      'stock_document',
      document_row.id,
      item_row.comment,
      auth.uid()
    );

    perform public.reconcile_product_stock(item_row.product_id);
  end loop;

  update public.stock_documents
  set status = 'posted', posted_by = auth.uid(), posted_at = now(), updated_at = now()
  where id = target_document_id
  returning * into document_row;

  perform public.create_purchase_finance_transaction(document_row.id);

  return document_row;
end;
$$;

create or replace function public.complete_order_payment(
  target_order_id uuid,
  target_method public.payment_method
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
begin
  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be paid in current status.'; end if;
  if order_row.total_amount <= 0 then raise exception 'Order total must be greater than zero.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;
  if exists (select 1 from public.order_adjustment_requests where order_id = order_row.id and status = 'pending') then
    raise exception 'Pending adjustment requests must be reviewed first.';
  end if;
  if exists (select 1 from public.payments where order_id = order_row.id and status = 'completed') then
    raise exception 'Order already has completed payment.';
  end if;

  perform set_config('app.order_write', '1', true);

  insert into public.payments (
    organization_id,
    order_id,
    method,
    status,
    amount,
    received_by,
    completed_at
  )
  values (
    order_row.organization_id,
    order_row.id,
    target_method,
    'completed',
    order_row.total_amount,
    auth.uid(),
    now()
  );

  perform public.consume_order_stock(order_row.id);

  update public.orders
  set
    status = 'paid',
    paid_amount = total_amount,
    unpaid_amount = 0,
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  perform public.sync_order_income(order_row.id);
  perform public.log_audit(order_row.organization_id, 'payment.completed', 'order', order_row.id, jsonb_build_object('method', target_method, 'amount', order_row.total_amount));

  return order_row;
end;
$$;

create or replace view public.finance_dashboard_summary
with (security_barrier = true)
as
select
  o.id as organization_id,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'income' and ft.status in ('paid', 'partial')), 0)::numeric(14,2) as total_income,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'expense' and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_expenses,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'purchase' and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_purchases,
  coalesce((select sum(outstanding_amount) from public.platform_share_accruals psa where psa.organization_id = o.id and psa.status <> 'paid'), 0)::numeric(14,2) as platform_share_outstanding,
  coalesce((select count(*) from public.finance_transactions ft where ft.organization_id = o.id and ft.expense_approval_status = 'pending'), 0)::integer as pending_expense_approvals,
  coalesce((select count(*) from public.financial_periods fp where fp.organization_id = o.id and fp.status in ('submitted', 'clarification_requested')), 0)::integer as periods_waiting_review
from public.organizations o
where public.is_platform_owner() or public.is_organization_admin(o.id);

alter table public.finance_categories enable row level security;
alter table public.organization_finance_settings enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.financial_periods enable row level security;
alter table public.organization_platform_share_rates enable row level security;
alter table public.platform_share_accruals enable row level security;
alter table public.platform_share_payments enable row level security;
alter table public.finance_audit_logs enable row level security;

drop policy if exists "Finance categories readable by finance roles" on public.finance_categories;
create policy "Finance categories readable by finance roles"
on public.finance_categories for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));
drop policy if exists "Finance categories writable by organization admins" on public.finance_categories;
create policy "Finance categories writable by organization admins"
on public.finance_categories for all to authenticated
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

drop policy if exists "Finance settings readable by finance roles" on public.organization_finance_settings;
create policy "Finance settings readable by finance roles"
on public.organization_finance_settings for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));
drop policy if exists "Finance settings writable by finance roles" on public.organization_finance_settings;
create policy "Finance settings writable by finance roles"
on public.organization_finance_settings for all to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Finance transactions readable by finance roles" on public.finance_transactions;
create policy "Finance transactions readable by finance roles"
on public.finance_transactions for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));
drop policy if exists "Finance transactions writable by finance roles through RPC" on public.finance_transactions;
create policy "Finance transactions writable by finance roles through RPC"
on public.finance_transactions for all to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Recurring expenses readable by organization admins" on public.recurring_expenses;
create policy "Recurring expenses readable by organization admins"
on public.recurring_expenses for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));
drop policy if exists "Recurring expenses writable by organization admins" on public.recurring_expenses;
create policy "Recurring expenses writable by organization admins"
on public.recurring_expenses for all to authenticated
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

drop policy if exists "Financial periods readable by finance roles" on public.financial_periods;
create policy "Financial periods readable by finance roles"
on public.financial_periods for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));
drop policy if exists "Financial periods writable by finance roles through RPC" on public.financial_periods;
create policy "Financial periods writable by finance roles through RPC"
on public.financial_periods for all to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Platform share rates readable by finance roles" on public.organization_platform_share_rates;
create policy "Platform share rates readable by finance roles"
on public.organization_platform_share_rates for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));
drop policy if exists "Platform share rates writable by platform owners" on public.organization_platform_share_rates;
create policy "Platform share rates writable by platform owners"
on public.organization_platform_share_rates for all to authenticated
using (public.is_platform_owner())
with check (public.is_platform_owner());

drop policy if exists "Platform share accruals readable by finance roles" on public.platform_share_accruals;
create policy "Platform share accruals readable by finance roles"
on public.platform_share_accruals for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));
drop policy if exists "Platform share accruals writable by finance roles through RPC" on public.platform_share_accruals;
create policy "Platform share accruals writable by finance roles through RPC"
on public.platform_share_accruals for all to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Platform share payments readable by finance roles" on public.platform_share_payments;
create policy "Platform share payments readable by finance roles"
on public.platform_share_payments for select to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id));
drop policy if exists "Platform share payments writable by finance roles through RPC" on public.platform_share_payments;
create policy "Platform share payments writable by finance roles through RPC"
on public.platform_share_payments for all to authenticated
using (public.is_platform_owner() or public.is_organization_admin(organization_id))
with check (public.is_platform_owner() or public.is_organization_admin(organization_id));

drop policy if exists "Finance audit readable by finance roles" on public.finance_audit_logs;
create policy "Finance audit readable by finance roles"
on public.finance_audit_logs for select to authenticated
using (public.is_platform_owner() or (organization_id is not null and public.is_organization_admin(organization_id)));
drop policy if exists "Finance audit writable through RPC" on public.finance_audit_logs;
create policy "Finance audit writable through RPC"
on public.finance_audit_logs for all to authenticated
using (public.is_platform_owner() or (organization_id is not null and public.is_organization_admin(organization_id)))
with check (public.is_platform_owner() or (organization_id is not null and public.is_organization_admin(organization_id)));

grant select on public.finance_categories to authenticated;
grant select on public.organization_finance_settings to authenticated;
grant select on public.finance_transactions to authenticated;
grant select on public.recurring_expenses to authenticated;
grant select on public.financial_periods to authenticated;
grant select on public.organization_platform_share_rates to authenticated;
grant select on public.platform_share_accruals to authenticated;
grant select on public.platform_share_payments to authenticated;
grant select on public.finance_audit_logs to authenticated;
grant select on public.order_financial_summary to authenticated;
grant select on public.finance_dashboard_summary to authenticated;

grant execute on function public.seed_standard_finance_categories(uuid) to authenticated;
grant execute on function public.sync_order_income(uuid) to authenticated;
grant execute on function public.create_purchase_finance_transaction(uuid) to authenticated;
grant execute on function public.create_manual_income(uuid, text, numeric, public.finance_payment_method, date, date, uuid, text, text) to authenticated;
grant execute on function public.create_expense(uuid, text, numeric, uuid, public.finance_payment_method, date, date, text, text, text, public.finance_source_type, uuid) to authenticated;
grant execute on function public.approve_expense(uuid, text, text) to authenticated;
grant execute on function public.generate_due_recurring_expenses(uuid, date) to authenticated;
grant execute on function public.calculate_financial_period(uuid, date, date) to authenticated;
grant execute on function public.submit_financial_period(date, date) to authenticated;
grant execute on function public.review_financial_period(uuid, text, text) to authenticated;
grant execute on function public.set_platform_share_rate(uuid, numeric, date, text) to authenticated;
grant execute on function public.report_platform_share_payment(uuid, numeric, public.finance_payment_method, date, text, text, text) to authenticated;
grant execute on function public.confirm_platform_share_payment(uuid, text, text) to authenticated;
