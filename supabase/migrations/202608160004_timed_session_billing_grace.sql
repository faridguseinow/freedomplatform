-- Add a 10-minute grace period after each timed-session billing boundary.

create or replace function public.complete_timed_session(target_session_id uuid)
returns public.timed_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.timed_sessions;
  actual integer;
  billable integer;
  amount numeric(14,2);
  existing_item_id uuid;
  opening_day_mode boolean;
  billing_grace_minutes constant integer := 10;
begin
  select * into session_row from public.timed_sessions where id = target_session_id for update;
  if session_row.id is null then raise exception 'Timed session was not found.'; end if;
  if not public.can_work_with_orders(session_row.organization_id) then raise exception 'You do not have access to this session.'; end if;
  if session_row.status = 'completed' then return session_row; end if;
  if session_row.status <> 'active' then raise exception 'Only active sessions can be completed.'; end if;

  opening_day_mode := public.is_opening_day_shift(
    coalesce(session_row.started_shift_id, public.current_employee_open_shift_id(session_row.organization_id))
  );

  actual := greatest(1, ceil(extract(epoch from (now() - session_row.started_at)) / 60.0)::integer);
  if opening_day_mode then
    billable := actual;
    amount := 0;
  elsif actual <= session_row.minimum_minutes_snapshot + billing_grace_minutes then
    billable := session_row.minimum_minutes_snapshot;
    amount := round((session_row.hourly_rate_snapshot * billable / 60.0)::numeric, 2);
  else
    billable := session_row.minimum_minutes_snapshot
      + ceil(
        (actual - session_row.minimum_minutes_snapshot - billing_grace_minutes)::numeric
        / session_row.billing_step_minutes_snapshot
      )::integer
      * session_row.billing_step_minutes_snapshot;
    amount := round((session_row.hourly_rate_snapshot * billable / 60.0)::numeric, 2);
  end if;

  perform set_config('app.order_write', '1', true);

  update public.timed_sessions
  set
    status = 'completed',
    ended_at = now(),
    actual_minutes = actual,
    billable_minutes = billable,
    calculated_amount = amount,
    ended_by = auth.uid(),
    updated_at = now()
  where id = session_row.id
  returning * into session_row;

  select id into existing_item_id
  from public.order_items
  where timed_session_id = session_row.id
  limit 1;

  if existing_item_id is null then
    insert into public.order_items (
      organization_id,
      order_id,
      item_type,
      timed_session_id,
      name_snapshot,
      description_snapshot,
      quantity,
      unit_price,
      total_price,
      metadata,
      added_by
    )
    values (
      session_row.organization_id,
      session_row.order_id,
      'timed_session',
      session_row.id,
      session_row.place_name_snapshot,
      session_row.service_name_snapshot,
      1,
      amount,
      amount,
      jsonb_build_object(
        'actual_minutes', actual,
        'billable_minutes', billable,
        'hourly_rate', session_row.hourly_rate_snapshot,
        'billing_grace_minutes', billing_grace_minutes,
        'opening_day_mode', opening_day_mode
      ),
      auth.uid()
    );
  end if;

  perform public.recalculate_order_totals(session_row.order_id);
  perform public.log_audit(
    session_row.organization_id,
    'session.completed',
    'timed_session',
    session_row.id,
    jsonb_build_object(
      'order_id', session_row.order_id,
      'amount', amount,
      'billable_minutes', billable,
      'billing_grace_minutes', billing_grace_minutes,
      'opening_day_mode', opening_day_mode
    )
  );

  return session_row;
end;
$$;
