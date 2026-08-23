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
  period_row public.financial_periods;
  summary jsonb;
begin
  if target_period_end < target_period_start then
    raise exception 'Period end cannot be before period start.';
  end if;

  select * into period_row
  from public.financial_periods
  where id = target_period_id
  for update;

  if period_row.id is null then
    raise exception 'Financial period was not found.';
  end if;

  if period_row.status = 'locked' then
    raise exception 'Locked financial period cannot be changed.';
  end if;

  if not (public.is_platform_owner() or public.is_organization_admin(period_row.organization_id)) then
    raise exception 'Only organization admins or platform owners can update financial periods.';
  end if;

  if exists (
    select 1
    from public.finance_transactions ft
    where ft.organization_id = period_row.organization_id
      and ft.transaction_type = 'expense'
      and ft.expense_approval_status = 'pending'
      and ft.accrual_date between target_period_start and target_period_end
  ) then
    raise exception 'Financial period has pending expense approvals.';
  end if;

  summary := public.calculate_financial_period(period_row.organization_id, target_period_start, target_period_end);
  perform set_config('app.finance_write', '1', true);

  update public.financial_periods
  set
    period_start = target_period_start,
    period_end = target_period_end,
    status = 'submitted'::public.financial_period_status,
    revenue = (summary ->> 'revenue')::numeric,
    cogs = (summary ->> 'cogs')::numeric,
    gross_profit = (summary ->> 'gross_profit')::numeric,
    operating_expenses = (summary ->> 'operating_expenses')::numeric,
    other_income = (summary ->> 'other_income')::numeric,
    net_profit_before_platform_share = (summary ->> 'net_profit_before_platform_share')::numeric,
    platform_share_percentage = (summary ->> 'platform_share_percentage')::numeric,
    platform_share_amount = (summary ->> 'platform_share_amount')::numeric,
    organization_owner_amount = (summary ->> 'organization_owner_amount')::numeric,
    cash_inflow = (summary ->> 'cash_inflow')::numeric,
    cash_outflow = (summary ->> 'cash_outflow')::numeric,
    submitted_by = auth.uid(),
    submitted_at = now(),
    reviewed_by = null,
    reviewed_at = null,
    review_comment = null,
    locked_at = null,
    updated_at = now()
  where id = target_period_id
  returning * into period_row;

  perform public.finance_log(period_row.organization_id, 'finance.period_updated', 'financial_period', period_row.id, null, to_jsonb(period_row));

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
  period_row public.financial_periods;
begin
  select * into period_row
  from public.financial_periods
  where id = target_period_id
  for update;

  if period_row.id is null then
    raise exception 'Financial period was not found.';
  end if;

  if period_row.status = 'locked' then
    raise exception 'Locked financial period cannot be cancelled.';
  end if;

  if not (public.is_platform_owner() or public.is_organization_admin(period_row.organization_id)) then
    raise exception 'Only organization admins or platform owners can cancel financial periods.';
  end if;

  perform set_config('app.finance_write', '1', true);

  update public.financial_periods
  set
    status = 'cancelled'::public.financial_period_status,
    review_comment = target_comment,
    updated_at = now()
  where id = target_period_id
  returning * into period_row;

  perform public.finance_log(period_row.organization_id, 'finance.period_cancelled', 'financial_period', period_row.id, null, to_jsonb(period_row), target_comment);

  return period_row;
end;
$$;

create or replace function public.delete_financial_period(
  target_period_id uuid,
  target_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row public.financial_periods;
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can delete financial periods.';
  end if;

  select * into period_row
  from public.financial_periods
  where id = target_period_id
  for update;

  if period_row.id is null then
    raise exception 'Financial period was not found.';
  end if;

  if period_row.status = 'locked' then
    raise exception 'Locked financial period cannot be deleted.';
  end if;

  perform set_config('app.finance_write', '1', true);

  delete from public.financial_periods
  where id = target_period_id;

  perform public.finance_log(
    period_row.organization_id,
    'finance.period_deleted',
    'financial_period',
    period_row.id,
    to_jsonb(period_row),
    null,
    target_comment
  );

  return target_period_id;
end;
$$;

grant execute on function public.update_financial_period(uuid, date, date) to authenticated;
grant execute on function public.cancel_financial_period(uuid, text) to authenticated;
grant execute on function public.delete_financial_period(uuid, text) to authenticated;
