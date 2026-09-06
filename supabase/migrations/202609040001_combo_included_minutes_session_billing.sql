-- Use combo included minutes to drive timed session limits and avoid double-charging.

create or replace function public.extend_timed_session_plan(
  target_session_id uuid,
  target_added_minutes integer
)
returns public.timed_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.timed_sessions;
  elapsed_minutes integer;
  base_planned_minutes integer;
  next_planned_minutes integer;
begin
  select * into session_row from public.timed_sessions where id = target_session_id for update;
  if session_row.id is null then raise exception 'Timed session was not found.'; end if;
  if session_row.status <> 'active' then raise exception 'Only active sessions can receive a planned duration.'; end if;
  if not public.can_work_with_orders(session_row.organization_id) then raise exception 'You do not have access to this session.'; end if;
  if target_added_minutes is null or target_added_minutes < 1 or target_added_minutes > 1440 then
    raise exception 'Added session duration must be between 1 and 1440 minutes.';
  end if;

  elapsed_minutes := greatest(1, ceil(extract(epoch from (now() - session_row.started_at)) / 60.0)::integer);
  base_planned_minutes := greatest(coalesce(session_row.planned_minutes, elapsed_minutes), elapsed_minutes);
  next_planned_minutes := least(1440, base_planned_minutes + target_added_minutes);

  perform set_config('app.order_write', '1', true);

  update public.timed_sessions
  set
    planned_minutes = next_planned_minutes,
    updated_at = now()
  where id = session_row.id
  returning * into session_row;

  perform public.log_audit(
    session_row.organization_id,
    'session.plan_extended',
    'timed_session',
    session_row.id,
    jsonb_build_object(
      'order_id', session_row.order_id,
      'added_minutes', target_added_minutes,
      'planned_minutes', next_planned_minutes,
      'elapsed_minutes', elapsed_minutes
    )
  );

  return session_row;
end;
$$;

grant execute on function public.extend_timed_session_plan(uuid, integer) to authenticated;

create or replace function public.complete_timed_session(target_session_id uuid)
returns public.timed_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.timed_sessions;
  raw_actual integer;
  actual integer;
  billable integer;
  chargeable_billable integer;
  combo_included_minutes numeric(14,3) := 0;
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

  raw_actual := greatest(1, ceil(extract(epoch from (now() - session_row.started_at)) / 60.0)::integer);
  actual := case
    when session_row.planned_minutes is not null and raw_actual >= session_row.planned_minutes
      then session_row.planned_minutes
    else raw_actual
  end;

  if opening_day_mode then
    billable := actual;
  elsif actual <= session_row.minimum_minutes_snapshot + billing_grace_minutes then
    billable := session_row.minimum_minutes_snapshot;
  else
    billable := session_row.minimum_minutes_snapshot
      + ceil(
        (actual - session_row.minimum_minutes_snapshot - billing_grace_minutes)::numeric
        / session_row.billing_step_minutes_snapshot
      )::integer
      * session_row.billing_step_minutes_snapshot;
  end if;

  select coalesce(
    sum(coalesce(occ.included_minutes, 0)::numeric * occ.quantity * oi.quantity),
    0
  )
  into combo_included_minutes
  from public.order_combo_components occ
  join public.order_items oi on oi.id = occ.order_item_id
  where oi.order_id = session_row.order_id
    and oi.status = 'active'
    and oi.item_type = 'combo'
    and occ.component_type = 'service'
    and occ.included_minutes is not null;

  chargeable_billable := greatest(0, billable - ceil(combo_included_minutes)::integer);
  amount := case
    when opening_day_mode then 0
    else round((session_row.hourly_rate_snapshot * chargeable_billable / 60.0)::numeric, 2)
  end;

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
        'raw_actual_minutes', raw_actual,
        'billable_minutes', billable,
        'chargeable_billable_minutes', chargeable_billable,
        'combo_included_minutes', combo_included_minutes,
        'hourly_rate', session_row.hourly_rate_snapshot,
        'billing_grace_minutes', billing_grace_minutes,
        'planned_minutes', session_row.planned_minutes,
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
      'actual_minutes', actual,
      'raw_actual_minutes', raw_actual,
      'billable_minutes', billable,
      'chargeable_billable_minutes', chargeable_billable,
      'combo_included_minutes', combo_included_minutes,
      'billing_grace_minutes', billing_grace_minutes,
      'planned_minutes', session_row.planned_minutes,
      'opening_day_mode', opening_day_mode
    )
  );

  return session_row;
end;
$$;

grant execute on function public.complete_timed_session(uuid) to authenticated;
