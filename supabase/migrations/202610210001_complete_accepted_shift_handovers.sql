-- Complete an incoming handover when the shift that accepted it is closed.
-- Pending handovers left across business-day boundaries are rolled forward
-- separately, one order at a time, when the next handover is created.

create or replace function public.complete_accepted_handover_on_shift_close()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    and new.status in ('closed', 'force_closed')
    and exists (
      select 1
      from public.organizations o
      where o.id = new.organization_id
        and o.slug = 'theliga'
    )
  then
    update public.shift_handovers
    set
      status = 'completed',
      completed_at = coalesce(completed_at, new.closed_at, now())
    where organization_id = new.organization_id
      and to_shift_id = new.id
      and status = 'accepted';
  end if;

  return new;
end;
$$;

-- When the same still-open order moves into a newer handover, finish only the
-- older handover that currently owns that order. This preserves its history
-- while allowing orders to pass through any number of shifts and days.
create or replace function public.assert_active_handover_order_unique()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.shift_handovers sh
  set
    status = 'completed',
    completed_at = coalesce(sh.completed_at, now())
  from public.shift_handover_orders sho
  where sho.handover_id = sh.id
    and sho.organization_id = new.organization_id
    and sho.order_id = new.order_id
    and sh.id <> new.handover_id
    and sh.status in ('pending', 'accepted')
    and exists (
      select 1
      from public.organizations o
      where o.id = new.organization_id
        and o.slug = 'theliga'
    );

  if exists (
    select 1
    from public.shift_handover_orders sho
    join public.shift_handovers sh on sh.id = sho.handover_id
    where sho.organization_id = new.organization_id
      and sho.order_id = new.order_id
      and sho.id <> coalesce(new.id, gen_random_uuid())
      and sh.status in ('pending', 'accepted')
  ) then
    raise exception 'Order already belongs to an active handover.';
  end if;

  return new;
end;
$$;

drop trigger if exists employee_shifts_complete_accepted_handover on public.employee_shifts;
create trigger employee_shifts_complete_accepted_handover
after update of status on public.employee_shifts
for each row execute function public.complete_accepted_handover_on_shift_close();

-- Repair accepted handovers whose receiving shift was already closed before
-- this lifecycle transition existed. This preserves all handover history.
do $$
begin
  perform set_config('app.shift_write', '1', true);

  update public.shift_handovers sh
  set
    status = 'completed',
    completed_at = coalesce(sh.completed_at, es.closed_at, now())
  from public.employee_shifts es
  where es.id = sh.to_shift_id
    and es.organization_id = sh.organization_id
    and exists (
      select 1
      from public.organizations o
      where o.id = sh.organization_id
        and o.slug = 'theliga'
    )
    and es.status in ('closed', 'force_closed')
    and sh.status = 'accepted';
end;
$$;

