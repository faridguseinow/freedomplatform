-- Platform payments are now a simple register sourced from organization
-- expenses. There are no automatic fees, rates, accruals or debts.

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
  goods_purchases numeric(14,2);
  operating_expenses numeric(14,2);
  cash_inflow numeric(14,2);
  cash_outflow numeric(14,2);
  gross_profit numeric(14,2);
  net_profit numeric(14,2);
begin
  if target_period_end < target_period_start then raise exception 'Period end cannot be before period start.'; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(target_organization_id)) then
    raise exception 'You do not have access to this financial period.';
  end if;

  select coalesce(sum(ft.amount), 0)::numeric(14,2) into revenue
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.status in ('paid', 'partial')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ft.amount), 0)::numeric(14,2) into manual_income
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.source_type = 'manual'
    and ft.status in ('paid', 'partial')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ft.amount), 0)::numeric(14,2) into goods_purchases
  from public.finance_transactions ft
  left join public.finance_categories fc on fc.id = ft.category_id
  where ft.organization_id = target_organization_id
    and ft.accrual_date between target_period_start and target_period_end
    and ft.status <> 'cancelled'
    and (
      ft.transaction_type = 'purchase'
      or (ft.transaction_type = 'expense' and fc.system_code = 'purchase_goods'
        and ft.expense_approval_status not in ('pending', 'rejected'))
    );

  select coalesce(sum(ft.amount), 0)::numeric(14,2) into operating_expenses
  from public.finance_transactions ft
  left join public.finance_categories fc on fc.id = ft.category_id
  where ft.organization_id = target_organization_id
    and ft.transaction_type in ('expense', 'platform_share_payment')
    and ft.affects_profit = true
    and coalesce(fc.system_code, '') <> 'purchase_goods'
    and ft.status <> 'cancelled'
    and ft.expense_approval_status not in ('pending', 'rejected')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ft.paid_amount), 0)::numeric(14,2) into cash_inflow
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.affects_cash_flow = true
    and ft.status in ('paid', 'partial')
    and ft.paid_date between target_period_start and target_period_end;

  select coalesce(sum(case when ft.transaction_type = 'purchase' then ft.amount else ft.paid_amount end), 0)::numeric(14,2)
  into cash_outflow
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type in ('expense', 'purchase', 'platform_share_payment')
    and ft.affects_cash_flow = true
    and ((ft.transaction_type = 'purchase' and ft.status <> 'cancelled')
      or (ft.transaction_type <> 'purchase' and ft.status in ('paid', 'partial')))
    and coalesce(ft.paid_date, ft.accrual_date) between target_period_start and target_period_end;

  gross_profit := revenue - goods_purchases;
  net_profit := gross_profit - operating_expenses;

  return jsonb_build_object(
    'organization_id', target_organization_id,
    'period_start', target_period_start,
    'period_end', target_period_end,
    'revenue', revenue,
    'cogs', goods_purchases,
    'gross_profit', gross_profit,
    'operating_expenses', operating_expenses,
    'other_income', manual_income,
    'net_profit_before_platform_share', net_profit,
    'platform_share_percentage', 0,
    'platform_share_amount', 0,
    'organization_owner_amount', net_profit,
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
begin
  if not public.is_platform_owner() then raise exception 'Only platform owners can review financial periods.'; end if;
  if target_decision not in ('approved', 'clarification_requested', 'rejected') then
    raise exception 'Decision must be approved, clarification_requested, or rejected.';
  end if;

  select * into period_row from public.financial_periods where id = target_period_id for update;
  if period_row.id is null then raise exception 'Financial period was not found.'; end if;
  if period_row.status = 'locked' then raise exception 'Locked financial period cannot be reviewed.'; end if;

  perform set_config('app.finance_write', '1', true);
  update public.financial_periods
  set
    status = case
      when target_decision = 'approved' then 'locked'::public.financial_period_status
      when target_decision = 'rejected' then 'rejected'::public.financial_period_status
      else 'clarification_requested'::public.financial_period_status
    end,
    platform_share_percentage = 0,
    platform_share_amount = 0,
    organization_owner_amount = net_profit_before_platform_share,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_comment = target_comment,
    locked_at = case when target_decision = 'approved' then now() else null end,
    updated_at = now()
  where id = target_period_id
  returning * into period_row;

  perform public.finance_log(period_row.organization_id, 'finance.period_' || target_decision, 'financial_period', period_row.id, null, to_jsonb(period_row), target_comment);
  return period_row;
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
begin
  if not public.is_platform_owner() then raise exception 'Only platform owners can confirm platform payments.'; end if;
  if target_decision not in ('confirmed', 'rejected') then
    raise exception 'Decision must be confirmed or rejected.';
  end if;

  select * into payment_row from public.platform_share_payments where id = target_payment_id for update;
  if payment_row.id is null then raise exception 'Platform payment was not found.'; end if;
  if payment_row.status <> 'reported_sent' then raise exception 'Only reported payments can be reviewed.'; end if;

  perform set_config('app.finance_write', '1', true);
  update public.platform_share_payments
  set status = target_decision,
      confirmed_received_by = auth.uid(),
      confirmed_received_at = now(),
      comment = coalesce(target_comment, comment),
      updated_at = now()
  where id = target_payment_id
  returning * into payment_row;

  perform public.finance_log(payment_row.organization_id, 'finance.platform_share_payment_' || target_decision,
    'platform_share_payment', payment_row.id, null, to_jsonb(payment_row), target_comment);
  return payment_row;
end;
$$;

create or replace function public.convert_expense_to_platform_period_payment(
  target_transaction_id uuid,
  target_period_start date,
  target_period_end date
)
returns public.platform_share_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_row public.finance_transactions;
  payment_row public.platform_share_payments;
  platform_category_id uuid;
  is_approved_historical_payment boolean;
begin
  select * into expense_row from public.finance_transactions where id = target_transaction_id for update;
  if expense_row.id is null then raise exception 'Expense was not found.'; end if;
  if not public.is_organization_admin(expense_row.organization_id) then raise exception 'Only organization admins can convert expenses.'; end if;
  if expense_row.transaction_type <> 'expense' or expense_row.source_type <> 'manual' or expense_row.status = 'cancelled' then
    raise exception 'Only active manual expenses can be converted.';
  end if;

  is_approved_historical_payment :=
    upper(btrim(expense_row.title)) = 'FERID'
    and expense_row.amount = 200
    and expense_row.payment_method = 'card_transfer'
    and expense_row.accrual_date = date '2026-09-14'
    and expense_row.paid_date = date '2026-09-15';

  select * into payment_row from public.report_platform_period_payment(
    expense_row.organization_id, target_period_start, target_period_end, expense_row.amount,
    coalesce(expense_row.payment_method, 'cash'::public.finance_payment_method),
    coalesce(expense_row.paid_date, expense_row.accrual_date), expense_row.title, expense_row.description
  );

  perform public.seed_standard_finance_categories(expense_row.organization_id);
  select id into platform_category_id from public.finance_categories
  where organization_id = expense_row.organization_id and system_code = 'platform_share_payment' limit 1;

  perform set_config('app.finance_write', '1', true);
  if is_approved_historical_payment then
    perform set_config('app.locked_platform_conversion_id', expense_row.id::text, true);
  end if;
  update public.finance_transactions
  set transaction_type = 'platform_share_payment', category_id = platform_category_id,
      status = 'paid', paid_amount = amount,
      reference = 'platform-payment:' || payment_row.id::text,
      affects_profit = true, affects_cash_flow = true,
      eligible_for_platform_share_deduction = false,
      cancelled_by = null, cancelled_at = null, cancellation_reason = null, updated_at = now()
  where id = expense_row.id;
  return payment_row;
end;
$$;

-- Keep the readiness contract stable while removing the obsolete fee check.
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
  telegram_configured boolean;
  migration_schema_readiness boolean;
  blocker_list text[] := array[]::text[];
  warning_list text[] := array[]::text[];
  required_ready integer := 0;
  required_total integer := 6;
begin
  if not (public.is_platform_owner() or public.is_organization_admin(target_organization_id)) then
    raise exception 'You do not have access to organization readiness.';
  end if;
  select exists (select 1 from public.organization_memberships where organization_id = target_organization_id and role = 'organization_admin' and is_active) into has_admin;
  select exists (select 1 from public.organization_memberships where organization_id = target_organization_id and role = 'employee' and is_active) into has_employee;
  select exists (select 1 from public.places where organization_id = target_organization_id and status = 'active') into has_places;
  select exists (select 1 from public.places where organization_id = target_organization_id and status = 'active' and has_timer) into has_timed_places;
  select exists (select 1 from public.products where organization_id = target_organization_id and status = 'active') into has_products;
  select exists (select 1 from public.services where organization_id = target_organization_id and status = 'active') into has_services;
  select exists (select 1 from public.shift_templates where organization_id = target_organization_id and is_active) into has_shift_templates;
  select exists (select 1 from public.finance_categories where organization_id = target_organization_id and is_active) into has_finance_categories;
  select exists (select 1 from public.organization_notification_settings where organization_id = target_organization_id and telegram_enabled and length(btrim(coalesce(telegram_chat_id, ''))) > 0) into telegram_configured;
  migration_schema_readiness := to_regclass('public.finance_transactions') is not null and to_regclass('public.employee_shifts') is not null and to_regclass('public.notification_outbox') is not null and to_regclass('public.stock_movements') is not null;
  if has_admin then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'admin'); end if;
  if has_employee then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'employee'); end if;
  if has_places then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'places'); end if;
  if has_timed_places then required_ready := required_ready + 1; else warning_list := array_append(warning_list, 'timed_places'); end if;
  if has_shift_templates then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'shift_templates'); end if;
  if has_finance_categories then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'finance_categories'); end if;
  if not telegram_configured then warning_list := array_append(warning_list, 'telegram'); end if;
  if not has_products and not has_services then warning_list := array_append(warning_list, 'products_or_services'); end if;
  if not migration_schema_readiness then blocker_list := array_append(blocker_list, 'schema'); end if;
  return jsonb_build_object('organization_id', target_organization_id, 'has_admin', has_admin,
    'has_employee', has_employee, 'has_places', has_places, 'has_timed_places', has_timed_places,
    'has_products', has_products, 'has_services', has_services, 'has_shift_templates', has_shift_templates,
    'has_finance_categories', has_finance_categories, 'has_share_rate', true,
    'telegram_configured', telegram_configured, 'migration_schema_readiness', migration_schema_readiness,
    'readiness_percentage', floor((required_ready::numeric / required_total::numeric) * 100)::integer,
    'blockers', blocker_list, 'warnings', warning_list);
end;
$$;

-- Detach preserved real payments before removing obsolete accrual records.
alter table public.platform_share_payments
  drop constraint if exists platform_share_payments_accrual_id_fkey;
select set_config('app.finance_write', '1', true);
update public.platform_share_payments set accrual_id = null where accrual_id is not null;

-- The summary keeps a zero compatibility column for older clients, but no
-- longer depends on or calculates automatic debt.
create or replace view public.finance_dashboard_summary
with (security_barrier = true)
as
select
  o.id as organization_id,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'income' and ft.status in ('paid', 'partial')), 0)::numeric(14,2) as total_income,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type in ('expense', 'purchase', 'platform_share_payment') and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_expenses,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'purchase' and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_purchases,
  0::numeric(14,2) as platform_share_outstanding,
  coalesce((select count(*) from public.finance_transactions ft where ft.organization_id = o.id and ft.expense_approval_status = 'pending'), 0)::integer as pending_expense_approvals,
  coalesce((select count(*) from public.financial_periods fp where fp.organization_id = o.id and fp.status in ('submitted', 'clarification_requested')), 0)::integer as periods_waiting_review,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id join public.places pl on o2.place_id = pl.id where p.organization_id = o.id and p.status = 'completed' and pl.type = 'playstation'), 0)::numeric(14,2) as playstation_revenue,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id join public.places pl on o2.place_id = pl.id where p.organization_id = o.id and p.status = 'completed' and pl.type = 'billiard'), 0)::numeric(14,2) as billiard_revenue,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id join public.places pl on o2.place_id = pl.id where p.organization_id = o.id and p.status = 'completed' and pl.type in ('table', 'vip_room')), 0)::numeric(14,2) as table_revenue,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id where p.organization_id = o.id and p.status = 'completed' and exists (select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product') and coalesce((select pl.type::text from public.places pl where pl.id = o2.place_id), '') not in ('playstation','billiard','table','vip_room')), 0)::numeric(14,2) as goods_revenue,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id left join public.places pl on o2.place_id = pl.id where p.organization_id = o.id and p.status = 'completed' and ((pl.id is null and not exists (select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product')) or (coalesce(pl.type::text, '') not in ('playstation','billiard','table','vip_room') and not exists (select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product')))), 0)::numeric(14,2) as other_revenue
from public.organizations o
where public.is_platform_owner() or public.is_organization_admin(o.id);

drop function if exists public.report_platform_share_payment(uuid, numeric, public.finance_payment_method, date, text, text, text);
drop function if exists public.convert_expense_to_platform_payment(uuid, uuid);
drop function if exists public.set_monthly_platform_fee(uuid, numeric, text);
drop function if exists public.get_monthly_platform_fee(uuid, date);
drop function if exists public.set_platform_share_rate(uuid, numeric, date, text);
drop function if exists public.get_current_platform_share_rate(uuid, date);

drop table if exists public.platform_share_accruals;
drop table if exists public.organization_platform_share_rates;

grant select on public.finance_dashboard_summary to authenticated;
grant execute on function public.calculate_financial_period(uuid, date, date) to authenticated;
grant execute on function public.review_financial_period(uuid, text, text) to authenticated;
grant execute on function public.confirm_platform_share_payment(uuid, text, text) to authenticated;
grant execute on function public.convert_expense_to_platform_period_payment(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
