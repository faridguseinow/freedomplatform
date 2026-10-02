-- Platform overview analytics and direct registration of platform payments.

create index if not exists payments_completed_revenue_idx
on public.payments (organization_id, completed_at)
where status = 'completed';

create or replace function public.get_platform_daily_revenue(
  target_start_date date,
  target_end_date date
)
returns table (
  organization_id uuid,
  revenue_date date,
  revenue numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can view platform revenue analytics.';
  end if;
  if target_start_date is null or target_end_date is null or target_end_date < target_start_date then
    raise exception 'Revenue date range is invalid.';
  end if;

  return query
  select
    revenue_row.organization_id,
    revenue_row.business_date,
    coalesce(sum(revenue_row.amount), 0)::numeric(14,2)
  from (
    select
      p.organization_id,
      coalesce(od.business_date, public.get_business_date(p.organization_id, p.completed_at)) as business_date,
      p.amount
    from public.payments p
    left join public.employee_shifts es on es.id = p.shift_id
    left join public.operational_days od on od.id = es.operational_day_id
    where p.status = 'completed'
      and p.completed_at is not null
  ) revenue_row
  where revenue_row.business_date between target_start_date and target_end_date
  group by revenue_row.organization_id, revenue_row.business_date
  order by revenue_row.organization_id, revenue_row.business_date;
end;
$$;

grant execute on function public.get_platform_daily_revenue(date, date) to authenticated;

create or replace function public.get_platform_business_dates()
returns table (
  organization_id uuid,
  business_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can view platform revenue analytics.';
  end if;

  return query
  select
    o.id,
    coalesce(active_day.business_date, public.get_business_date(o.id, now()))
  from public.organizations o
  left join lateral (
    select od.business_date
    from public.employee_shifts es
    join public.operational_days od on od.id = es.operational_day_id
    where es.organization_id = o.id
      and es.status in ('open', 'closing')
    order by es.opened_at desc
    limit 1
  ) active_day on true;
end;
$$;

grant execute on function public.get_platform_business_dates() to authenticated;

create or replace function public.get_platform_payment_summary()
returns table (
  organization_id uuid,
  total_paid numeric,
  last_payment_date date,
  last_billing_period_start date,
  last_billing_period_end date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can view platform payment analytics.';
  end if;

  return query
  select
    o.id,
    coalesce(totals.total_paid, 0)::numeric(14,2),
    latest.payment_date,
    latest.billing_period_start,
    latest.billing_period_end
  from public.organizations o
  left join lateral (
    select sum(p.amount) as total_paid
    from public.platform_share_payments p
    where p.organization_id = o.id
      and p.status = 'confirmed'
  ) totals on true
  left join lateral (
    select p.payment_date, p.billing_period_start, p.billing_period_end
    from public.platform_share_payments p
    where p.organization_id = o.id
      and p.status = 'confirmed'
    order by p.payment_date desc, p.created_at desc
    limit 1
  ) latest on true;
end;
$$;

grant execute on function public.get_platform_payment_summary() to authenticated;

-- A payment entered by an organization is already a completed real-world payment.
update public.platform_share_payments
set
  status = 'confirmed',
  confirmed_received_at = coalesce(confirmed_received_at, marked_sent_at, created_at),
  updated_at = now()
where status = 'reported_sent';

create or replace function public.report_platform_period_payment(
  target_organization_id uuid,
  target_period_start date,
  target_period_end date,
  target_amount numeric,
  target_payment_method public.finance_payment_method,
  target_payment_date date,
  target_reference text default null,
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
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Only organization admins can register platform payments.';
  end if;
  if target_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;
  if target_period_start is null or target_period_end is null or target_period_end < target_period_start then
    raise exception 'Platform payment period is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));

  if exists (
    select 1
    from public.platform_share_payments
    where organization_id = target_organization_id
      and billing_period_start <= target_period_end
      and billing_period_end >= target_period_start
      and status <> 'rejected'
  ) then
    raise exception 'This platform payment period overlaps an existing payment.';
  end if;

  perform set_config('app.finance_write', '1', true);

  insert into public.platform_share_payments (
    organization_id,
    accrual_id,
    billing_period_start,
    billing_period_end,
    amount,
    payment_method,
    payment_date,
    reference,
    marked_sent_by,
    marked_sent_at,
    confirmed_received_at,
    status,
    comment
  )
  values (
    target_organization_id,
    null,
    target_period_start,
    target_period_end,
    target_amount,
    target_payment_method,
    target_payment_date,
    target_reference,
    auth.uid(),
    now(),
    now(),
    'confirmed',
    target_comment
  )
  returning * into payment_row;

  perform public.finance_log(
    target_organization_id,
    'finance.platform_period_payment_recorded',
    'platform_share_payment',
    payment_row.id,
    null,
    to_jsonb(payment_row)
  );

  return payment_row;
end;
$$;

drop function if exists public.confirm_platform_share_payment(uuid, text, text);

notify pgrst, 'reload schema';
