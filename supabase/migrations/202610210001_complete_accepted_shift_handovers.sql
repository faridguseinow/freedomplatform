-- Complete an incoming handover when the shift that accepted it is closed.
-- Without this transition, open orders cannot be handed over again because
-- they still belong to the previous handover with status = 'accepted'.

create or replace function public.complete_accepted_handover_on_shift_close()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    and new.status in ('closed', 'force_closed')
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
    and es.status in ('closed', 'force_closed')
    and sh.status = 'accepted';
end;
$$;

