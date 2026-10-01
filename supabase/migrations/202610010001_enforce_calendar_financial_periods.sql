-- Financial periods are inclusive calendar ranges. Starting October 2026,
-- every new period must cover a complete month and continue without gaps.

create or replace function public.validate_financial_period_range()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  business_date date := (now() at time zone 'Asia/Baku')::date;
  expected_month_end date;
  previous_period_end date;
  next_period_start date;
begin
  if new.status in ('cancelled', 'rejected') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id = old.organization_id
      and new.period_start = old.period_start
      and new.period_end = old.period_end then
      return new;
    end if;
  end if;

  if new.period_end < new.period_start then
    raise exception 'Period end cannot be before period start.';
  end if;

  -- Let submit_financial_period reuse an existing rejected/clarification row
  -- through its ON CONFLICT branch.
  if tg_op = 'INSERT' and exists (
    select 1
    from public.financial_periods fp
    where fp.organization_id = new.organization_id
      and fp.period_start = new.period_start
      and fp.period_end = new.period_end
  ) then
    return new;
  end if;

  if new.period_start >= date '2026-10-01' then
    expected_month_end :=
      (date_trunc('month', new.period_start)::date + interval '1 month - 1 day')::date;

    if extract(day from new.period_start) <> 1 or new.period_end <> expected_month_end then
      raise exception 'Financial period must cover a complete calendar month.';
    end if;

    if new.period_end >= business_date then
      raise exception 'Financial period can be submitted only after the month is complete.';
    end if;
  end if;

  if exists (
    select 1
    from public.financial_periods fp
    where fp.organization_id = new.organization_id
      and fp.id is distinct from new.id
      and fp.status not in ('cancelled', 'rejected')
      and fp.period_start <= new.period_end
      and fp.period_end >= new.period_start
  ) then
    raise exception 'Financial period overlaps an existing period.';
  end if;

  select max(fp.period_end)
  into previous_period_end
  from public.financial_periods fp
  where fp.organization_id = new.organization_id
    and fp.id is distinct from new.id
    and fp.status not in ('cancelled', 'rejected')
    and fp.period_end < new.period_start;

  if previous_period_end is not null and new.period_start <> previous_period_end + 1 then
    raise exception 'Financial period must start on the day after the previous period.';
  end if;

  select min(fp.period_start)
  into next_period_start
  from public.financial_periods fp
  where fp.organization_id = new.organization_id
    and fp.id is distinct from new.id
    and fp.status not in ('cancelled', 'rejected')
    and fp.period_start > new.period_end;

  if next_period_start is not null and new.period_end <> next_period_start - 1 then
    raise exception 'Financial period must end on the day before the next period.';
  end if;

  return new;
end;
$$;

drop trigger if exists financial_periods_range_guard on public.financial_periods;
create trigger financial_periods_range_guard
before insert or update of organization_id, period_start, period_end, status
on public.financial_periods
for each row execute function public.validate_financial_period_range();
