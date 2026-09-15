-- Move one open order between places while preserving independently billed sessions.

create or replace function public.complete_timed_session(target_session_id uuid)
returns public.timed_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.timed_sessions;
  current_pause_seconds integer;
  paused_seconds integer;
  elapsed_seconds numeric;
  raw_actual integer;
  actual integer;
  billable integer;
  chargeable_billable integer;
  combo_included_minutes numeric(14,3) := 0;
  previously_applied_minutes numeric(14,3) := 0;
  applied_included_minutes integer := 0;
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
  current_pause_seconds := case
    when session_row.paused_at is null then 0
    else greatest(0, floor(extract(epoch from (now() - session_row.paused_at)))::integer)
  end;
  paused_seconds := session_row.total_paused_seconds + current_pause_seconds;
  elapsed_seconds := greatest(0, extract(epoch from (now() - session_row.started_at)) - paused_seconds);
  raw_actual := greatest(1, ceil(elapsed_seconds / 60.0)::integer);
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
      )::integer * session_row.billing_step_minutes_snapshot;
  end if;

  select coalesce(sum(coalesce(occ.included_minutes, 0)::numeric * occ.quantity * oi.quantity), 0)
  into combo_included_minutes
  from public.order_combo_components occ
  join public.order_items oi on oi.id = occ.order_item_id
  where oi.order_id = session_row.order_id
    and oi.status = 'active'
    and oi.item_type = 'combo'
    and occ.component_type = 'service'
    and occ.included_minutes is not null;

  select coalesce(sum(coalesce(
    nullif(oi.metadata ->> 'combo_included_minutes_applied', '')::numeric,
    greatest(
      0,
      coalesce(nullif(oi.metadata ->> 'billable_minutes', '')::numeric, 0)
        - coalesce(nullif(oi.metadata ->> 'chargeable_billable_minutes', '')::numeric, 0)
    )
  )), 0)
  into previously_applied_minutes
  from public.order_items oi
  where oi.order_id = session_row.order_id
    and oi.status = 'active'
    and oi.item_type = 'timed_session'
    and oi.timed_session_id <> session_row.id;

  applied_included_minutes := case
    when opening_day_mode then 0
    else least(
      billable,
      greatest(0, ceil(combo_included_minutes - previously_applied_minutes)::integer)
    )
  end;
  chargeable_billable := greatest(0, billable - applied_included_minutes);
  amount := case
    when opening_day_mode then 0
    else round((session_row.hourly_rate_snapshot * chargeable_billable / 60.0)::numeric, 2)
  end;

  perform set_config('app.order_write', '1', true);

  update public.timed_sessions
  set status = 'completed', paused_at = null, total_paused_seconds = paused_seconds,
      ended_at = now(), actual_minutes = actual, billable_minutes = billable,
      calculated_amount = amount, ended_by = auth.uid(), updated_at = now()
  where id = session_row.id
  returning * into session_row;

  select id into existing_item_id
  from public.order_items
  where timed_session_id = session_row.id
  limit 1;

  if existing_item_id is null then
    insert into public.order_items (
      organization_id, order_id, item_type, timed_session_id, name_snapshot,
      description_snapshot, quantity, unit_price, total_price, metadata, added_by
    ) values (
      session_row.organization_id, session_row.order_id, 'timed_session', session_row.id,
      session_row.place_name_snapshot, session_row.service_name_snapshot, 1, amount, amount,
      jsonb_build_object(
        'actual_minutes', actual,
        'raw_actual_minutes', raw_actual,
        'billable_minutes', billable,
        'chargeable_billable_minutes', chargeable_billable,
        'combo_included_minutes', combo_included_minutes,
        'combo_included_minutes_applied', applied_included_minutes,
        'hourly_rate', session_row.hourly_rate_snapshot,
        'billing_grace_minutes', billing_grace_minutes,
        'planned_minutes', session_row.planned_minutes,
        'paused_seconds', paused_seconds,
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
      'combo_included_minutes_applied', applied_included_minutes,
      'billing_grace_minutes', billing_grace_minutes,
      'planned_minutes', session_row.planned_minutes,
      'paused_seconds', paused_seconds,
      'opening_day_mode', opening_day_mode
    )
  );

  return session_row;
end;
$$;

create or replace function public.transfer_open_order_to_place(
  target_order_id uuid,
  target_place_id uuid,
  target_comment text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  target_place public.places;
  source_place_id uuid;
  active_session_id uuid;
begin
  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status <> 'open' then raise exception 'Only open orders can be moved.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if order_row.place_id = target_place_id then raise exception 'Order is already assigned to this place.'; end if;
  source_place_id := order_row.place_id;

  select * into target_place from public.places where id = target_place_id for update;
  if target_place.id is null then raise exception 'Target place was not found.'; end if;
  if target_place.organization_id <> order_row.organization_id or target_place.status <> 'active' then
    raise exception 'Target place is not active in this organization.';
  end if;
  if exists (
    select 1 from public.orders
    where organization_id = order_row.organization_id
      and place_id = target_place.id
      and status in ('open', 'waiting_payment')
      and id <> order_row.id
  ) then
    raise exception 'Target place already has an active order.';
  end if;
  if exists (
    select 1 from public.timed_sessions
    where organization_id = order_row.organization_id
      and place_id = target_place.id
      and status = 'active'
  ) then
    raise exception 'Target place already has an active timed session.';
  end if;

  select id into active_session_id
  from public.timed_sessions
  where order_id = order_row.id and status = 'active'
  for update;

  if active_session_id is not null then
    perform public.complete_timed_session(active_session_id);
  end if;

  select * into order_row
  from public.move_open_order_to_place(target_order_id, target_place_id, target_comment);

  if target_place.has_timer then
    perform public.start_timed_session(target_place_id, target_order_id, null);
  end if;

  perform public.log_audit(
    order_row.organization_id,
    'order.transferred',
    'order',
    order_row.id,
    jsonb_build_object(
      'from_place_id', source_place_id,
      'to_place_id', target_place_id,
      'completed_session_id', active_session_id,
      'new_session_started', target_place.has_timer
    )
  );

  select * into order_row from public.orders where id = target_order_id;
  return order_row;
end;
$$;

grant execute on function public.transfer_open_order_to_place(uuid, uuid, text) to authenticated;
