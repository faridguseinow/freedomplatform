-- Align platform analytics with the operational days used by shift reports.

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

notify pgrst, 'reload schema';
