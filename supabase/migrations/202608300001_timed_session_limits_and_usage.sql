-- Add optional planned duration for timed sessions.

alter table public.timed_sessions
add column if not exists planned_minutes integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'timed_sessions_planned_minutes_check'
      and conrelid = 'public.timed_sessions'::regclass
  ) then
    alter table public.timed_sessions
    add constraint timed_sessions_planned_minutes_check
    check (planned_minutes is null or planned_minutes between 1 and 1440);
  end if;
end;
$$;

drop function if exists public.start_timed_session(uuid, uuid);

create or replace function public.start_timed_session(
  target_place_id uuid,
  target_order_id uuid default null,
  target_planned_minutes integer default null
)
returns public.timed_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  place_row public.places;
  order_row public.orders;
  session_row public.timed_sessions;
begin
  select * into place_row from public.places where id = target_place_id for update;
  if place_row.id is null then raise exception 'Place was not found.'; end if;
  if place_row.status <> 'active' or place_row.has_timer = false then raise exception 'Place is not an active timed place.'; end if;
  if place_row.type = 'table' and target_planned_minutes is not null then raise exception 'Tables do not support planned session duration.'; end if;
  if target_planned_minutes is not null and (target_planned_minutes < 1 or target_planned_minutes > 1440) then
    raise exception 'Planned session duration must be between 1 and 1440 minutes.';
  end if;
  if not public.can_work_with_orders(place_row.organization_id) then raise exception 'You do not have access to this place.'; end if;
  if coalesce(place_row.hourly_rate, 0) <= 0 or coalesce(place_row.minimum_minutes, 0) <= 0 or coalesce(place_row.billing_step_minutes, 0) <= 0 then
    raise exception 'Timed place tariff is incomplete.';
  end if;

  if exists (select 1 from public.timed_sessions where organization_id = place_row.organization_id and place_id = place_row.id and status = 'active') then
    raise exception 'Place already has an active timed session.';
  end if;

  perform set_config('app.order_write', '1', true);

  if target_order_id is null then
    insert into public.orders (
      organization_id,
      place_id,
      current_place_name_snapshot,
      opened_by
    )
    values (
      place_row.organization_id,
      place_row.id,
      place_row.name,
      auth.uid()
    )
    returning * into order_row;
  else
    select * into order_row from public.orders where id = target_order_id for update;
    if order_row.id is null then raise exception 'Order was not found.'; end if;
    if order_row.organization_id <> place_row.organization_id then raise exception 'Order and place belong to different organizations.'; end if;
    if order_row.status <> 'open' then raise exception 'Only open orders can receive timed sessions.'; end if;
    if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
      raise exception 'Order already has an active timed session.';
    end if;

    update public.orders
    set
      place_id = place_row.id,
      current_place_name_snapshot = place_row.name,
      updated_at = now()
    where id = order_row.id
    returning * into order_row;
  end if;

  insert into public.timed_sessions (
    organization_id,
    order_id,
    place_id,
    place_name_snapshot,
    hourly_rate_snapshot,
    minimum_minutes_snapshot,
    billing_step_minutes_snapshot,
    planned_minutes,
    started_by
  )
  values (
    place_row.organization_id,
    order_row.id,
    place_row.id,
    place_row.name,
    place_row.hourly_rate,
    place_row.minimum_minutes,
    place_row.billing_step_minutes,
    target_planned_minutes,
    auth.uid()
  )
  returning * into session_row;

  perform public.log_audit(
    place_row.organization_id,
    'session.started',
    'timed_session',
    session_row.id,
    jsonb_build_object(
      'order_id', order_row.id,
      'place_id', place_row.id,
      'planned_minutes', target_planned_minutes
    )
  );

  return session_row;
end;
$$;

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
        'raw_actual_minutes', raw_actual,
        'billable_minutes', billable,
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
      'billing_grace_minutes', billing_grace_minutes,
      'planned_minutes', session_row.planned_minutes,
      'opening_day_mode', opening_day_mode
    )
  );

  return session_row;
end;
$$;

create or replace view public.employee_workspace_places
with (security_invoker = false, security_barrier = true)
as
select
  p.id,
  p.organization_id,
  p.category_id,
  p.name,
  p.type,
  p.custom_type_name,
  p.description,
  p.image_path,
  p.has_timer,
  p.hourly_rate,
  p.minimum_minutes,
  p.billing_step_minutes,
  p.capacity,
  p.sort_order,
  p.status,
  o.id as active_order_id,
  o.order_number as active_order_number,
  o.opened_at as active_order_opened_at,
  o.status as active_order_status,
  o.total_amount as active_order_total,
  ts.id as active_session_id,
  ts.started_at as active_session_started_at,
  ts.hourly_rate_snapshot as active_session_hourly_rate,
  ts.minimum_minutes_snapshot as active_session_minimum_minutes,
  ts.billing_step_minutes_snapshot as active_session_billing_step_minutes,
  coalesce((
    select count(*)
    from public.order_items oi
    where oi.order_id = o.id
      and oi.status = 'active'
  ), 0)::integer as active_order_item_count,
  p.workspace_x,
  p.workspace_y,
  p.workspace_w,
  p.workspace_h,
  pve.equipment_name as vip_equipment_name,
  pve.equipment_time as vip_equipment_time,
  pve.equipment_price as vip_equipment_price,
  ts.planned_minutes as active_session_planned_minutes
from public.places p
left join public.orders o on o.place_id = p.id and o.status in ('open', 'waiting_payment')
left join public.timed_sessions ts on ts.place_id = p.id and ts.status = 'active'
left join public.place_vip_equipment pve on pve.place_id = p.id
where p.status = 'active'
  and public.is_organization_member(p.organization_id);

create or replace view public.employee_timed_sessions
with (security_invoker = false, security_barrier = true)
as
select
  ts.id,
  ts.organization_id,
  ts.order_id,
  ts.place_id,
  ts.service_id,
  ts.status,
  ts.place_name_snapshot,
  ts.service_name_snapshot,
  ts.hourly_rate_snapshot,
  ts.minimum_minutes_snapshot,
  ts.billing_step_minutes_snapshot,
  ts.started_at,
  ts.ended_at,
  ts.actual_minutes,
  ts.billable_minutes,
  ts.calculated_amount,
  ts.started_by,
  ts.ended_by,
  ts.created_at,
  ts.updated_at,
  ts.started_shift_id,
  ts.ended_shift_id,
  ts.planned_minutes
from public.timed_sessions ts
where public.is_organization_member(ts.organization_id);

grant execute on function public.start_timed_session(uuid, uuid, integer) to authenticated;
grant execute on function public.complete_timed_session(uuid) to authenticated;
grant select on public.employee_workspace_places to authenticated;
grant select on public.employee_timed_sessions to authenticated;
