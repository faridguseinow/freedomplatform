-- Financial periods are owned by the organization. Closing a period no longer
-- creates a platform-review task; organization admins can close and reopen it.

create or replace function public.prevent_locked_financial_period_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.status = 'locked'
    and coalesce(current_setting('app.finance_write', true), '') <> '1'
  then
    raise exception 'Locked financial periods can be changed only through finance RPC functions.';
  end if;

  return new;
end;
$$;

create or replace function public.close_financial_period(
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
  previous_row public.financial_periods;
  period_row public.financial_periods;
begin
  target_organization_id := public.current_user_primary_organization_id();
  if target_organization_id is null then
    raise exception 'Organization was not found for current user.';
  end if;
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Only organization admins can close financial periods.';
  end if;
  if target_period_end < target_period_start then
    raise exception 'Period end cannot be before period start.';
  end if;

  select * into previous_row
  from public.financial_periods
  where organization_id = target_organization_id
    and period_start = target_period_start
    and period_end = target_period_end
  for update;

  if previous_row.status = 'locked' then
    return previous_row;
  end if;

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
    submitted_at,
    reviewed_by,
    reviewed_at,
    review_comment,
    locked_at
  )
  values (
    target_organization_id,
    target_period_start,
    target_period_end,
    'locked',
    (summary ->> 'revenue')::numeric,
    (summary ->> 'cogs')::numeric,
    (summary ->> 'gross_profit')::numeric,
    (summary ->> 'operating_expenses')::numeric,
    (summary ->> 'other_income')::numeric,
    (summary ->> 'net_profit_before_platform_share')::numeric,
    0,
    0,
    (summary ->> 'net_profit_before_platform_share')::numeric,
    (summary ->> 'cash_inflow')::numeric,
    (summary ->> 'cash_outflow')::numeric,
    auth.uid(),
    now(),
    null,
    null,
    null,
    now()
  )
  on conflict (organization_id, period_start, period_end) do update
  set
    status = 'locked',
    revenue = excluded.revenue,
    cogs = excluded.cogs,
    gross_profit = excluded.gross_profit,
    operating_expenses = excluded.operating_expenses,
    other_income = excluded.other_income,
    net_profit_before_platform_share = excluded.net_profit_before_platform_share,
    platform_share_percentage = 0,
    platform_share_amount = 0,
    organization_owner_amount = excluded.net_profit_before_platform_share,
    cash_inflow = excluded.cash_inflow,
    cash_outflow = excluded.cash_outflow,
    submitted_by = auth.uid(),
    submitted_at = now(),
    reviewed_by = null,
    reviewed_at = null,
    review_comment = null,
    locked_at = now(),
    updated_at = now()
  returning * into period_row;

  perform public.finance_log(
    target_organization_id,
    'finance.period_closed',
    'financial_period',
    period_row.id,
    case when previous_row.id is null then null else to_jsonb(previous_row) end,
    to_jsonb(period_row)
  );

  return period_row;
end;
$$;

create or replace function public.reopen_financial_period(
  target_period_id uuid
)
returns public.financial_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_row public.financial_periods;
  period_row public.financial_periods;
begin
  select * into previous_row
  from public.financial_periods
  where id = target_period_id
  for update;

  if previous_row.id is null then
    raise exception 'Financial period was not found.';
  end if;
  if not public.is_organization_admin(previous_row.organization_id) then
    raise exception 'Only organization admins can reopen financial periods.';
  end if;
  if previous_row.status = 'cancelled' then
    raise exception 'Cancelled financial period cannot be reopened.';
  end if;
  if previous_row.status = 'open' then
    return previous_row;
  end if;

  perform set_config('app.finance_write', '1', true);

  update public.financial_periods
  set
    status = 'open'::public.financial_period_status,
    submitted_by = null,
    submitted_at = null,
    reviewed_by = null,
    reviewed_at = null,
    review_comment = null,
    locked_at = null,
    updated_at = now()
  where id = target_period_id
  returning * into period_row;

  perform public.finance_log(
    period_row.organization_id,
    'finance.period_reopened',
    'financial_period',
    period_row.id,
    to_jsonb(previous_row),
    to_jsonb(period_row)
  );

  return period_row;
end;
$$;

create or replace function public.update_financial_period(
  target_period_id uuid,
  target_period_start date,
  target_period_end date
)
returns public.financial_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_row public.financial_periods;
  period_row public.financial_periods;
  summary jsonb;
begin
  if target_period_end < target_period_start then
    raise exception 'Period end cannot be before period start.';
  end if;

  select * into previous_row
  from public.financial_periods
  where id = target_period_id
  for update;

  if previous_row.id is null then
    raise exception 'Financial period was not found.';
  end if;
  if not public.is_organization_admin(previous_row.organization_id) then
    raise exception 'Only organization admins can update financial periods.';
  end if;
  if previous_row.status = 'locked' then
    raise exception 'Reopen the financial period before changing it.';
  end if;
  if previous_row.status = 'cancelled' then
    raise exception 'Cancelled financial period cannot be changed.';
  end if;

  summary := public.calculate_financial_period(previous_row.organization_id, target_period_start, target_period_end);
  perform set_config('app.finance_write', '1', true);

  update public.financial_periods
  set
    period_start = target_period_start,
    period_end = target_period_end,
    status = 'open'::public.financial_period_status,
    revenue = (summary ->> 'revenue')::numeric,
    cogs = (summary ->> 'cogs')::numeric,
    gross_profit = (summary ->> 'gross_profit')::numeric,
    operating_expenses = (summary ->> 'operating_expenses')::numeric,
    other_income = (summary ->> 'other_income')::numeric,
    net_profit_before_platform_share = (summary ->> 'net_profit_before_platform_share')::numeric,
    platform_share_percentage = 0,
    platform_share_amount = 0,
    organization_owner_amount = (summary ->> 'net_profit_before_platform_share')::numeric,
    cash_inflow = (summary ->> 'cash_inflow')::numeric,
    cash_outflow = (summary ->> 'cash_outflow')::numeric,
    submitted_by = null,
    submitted_at = null,
    reviewed_by = null,
    reviewed_at = null,
    review_comment = null,
    locked_at = null,
    updated_at = now()
  where id = target_period_id
  returning * into period_row;

  perform public.finance_log(
    period_row.organization_id,
    'finance.period_updated',
    'financial_period',
    period_row.id,
    to_jsonb(previous_row),
    to_jsonb(period_row)
  );

  return period_row;
end;
$$;

create or replace function public.cancel_financial_period(
  target_period_id uuid,
  target_comment text default null
)
returns public.financial_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_row public.financial_periods;
  period_row public.financial_periods;
begin
  select * into previous_row
  from public.financial_periods
  where id = target_period_id
  for update;

  if previous_row.id is null then
    raise exception 'Financial period was not found.';
  end if;
  if not public.is_organization_admin(previous_row.organization_id) then
    raise exception 'Only organization admins can cancel financial periods.';
  end if;
  if previous_row.status = 'locked' then
    raise exception 'Reopen the financial period before cancelling it.';
  end if;

  perform set_config('app.finance_write', '1', true);

  update public.financial_periods
  set
    status = 'cancelled'::public.financial_period_status,
    review_comment = target_comment,
    updated_at = now()
  where id = target_period_id
  returning * into period_row;

  perform public.finance_log(
    period_row.organization_id,
    'finance.period_cancelled',
    'financial_period',
    period_row.id,
    to_jsonb(previous_row),
    to_jsonb(period_row),
    target_comment
  );

  return period_row;
end;
$$;

-- Remove the old platform review API and its submission API.
drop function if exists public.review_financial_period(uuid, text, text);
drop function if exists public.submit_financial_period(date, date);

-- Existing review-flow periods become ordinary closed periods.
select set_config('app.finance_write', '1', true);
update public.financial_periods
set
  status = 'locked'::public.financial_period_status,
  platform_share_percentage = 0,
  platform_share_amount = 0,
  organization_owner_amount = net_profit_before_platform_share,
  locked_at = coalesce(locked_at, now()),
  updated_at = now()
where status in ('submitted', 'clarification_requested', 'approved', 'rejected');

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
  0::integer as periods_waiting_review,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id join public.places pl on o2.place_id = pl.id where p.organization_id = o.id and p.status = 'completed' and pl.type = 'playstation'), 0)::numeric(14,2) as playstation_revenue,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id join public.places pl on o2.place_id = pl.id where p.organization_id = o.id and p.status = 'completed' and pl.type = 'billiard'), 0)::numeric(14,2) as billiard_revenue,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id join public.places pl on o2.place_id = pl.id where p.organization_id = o.id and p.status = 'completed' and pl.type in ('table', 'vip_room')), 0)::numeric(14,2) as table_revenue,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id where p.organization_id = o.id and p.status = 'completed' and exists (select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product') and coalesce((select pl.type::text from public.places pl where pl.id = o2.place_id), '') not in ('playstation','billiard','table','vip_room')), 0)::numeric(14,2) as goods_revenue,
  coalesce((select sum(p.amount) from public.payments p join public.orders o2 on p.order_id = o2.id left join public.places pl on o2.place_id = pl.id where p.organization_id = o.id and p.status = 'completed' and ((pl.id is null and not exists (select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product')) or (coalesce(pl.type::text, '') not in ('playstation','billiard','table','vip_room') and not exists (select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product')))), 0)::numeric(14,2) as other_revenue
from public.organizations o
where public.is_platform_owner() or public.is_organization_admin(o.id);

grant execute on function public.close_financial_period(date, date) to authenticated;
grant execute on function public.reopen_financial_period(uuid) to authenticated;
grant execute on function public.update_financial_period(uuid, date, date) to authenticated;
grant execute on function public.cancel_financial_period(uuid, text) to authenticated;
grant select on public.finance_dashboard_summary to authenticated;

notify pgrst, 'reload schema';
