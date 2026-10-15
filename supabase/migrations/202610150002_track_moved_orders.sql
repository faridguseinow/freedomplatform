alter table public.orders
  add column if not exists moved_to_order_id uuid references public.orders(id) on delete set null,
  add column if not exists moved_to_order_number_snapshot bigint,
  add column if not exists moved_to_place_name_snapshot text,
  add column if not exists moved_at timestamptz;

create index if not exists orders_moved_to_order_id_idx
on public.orders (moved_to_order_id)
where moved_to_order_id is not null;

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
  source_order public.orders;
  destination_order public.orders;
  target_place public.places;
  source_place_id uuid;
  active_session_id uuid;
begin
  select * into source_order from public.orders where id = target_order_id for update;
  if source_order.id is null then raise exception 'Order was not found.'; end if;
  if source_order.status <> 'open' then raise exception 'Only open orders can be moved.'; end if;
  if not public.can_work_with_orders(source_order.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if source_order.place_id = target_place_id then raise exception 'Order is already assigned to this place.'; end if;

  source_place_id := source_order.place_id;

  select * into target_place from public.places where id = target_place_id for update;
  if target_place.id is null then raise exception 'Target place was not found.'; end if;
  if target_place.organization_id <> source_order.organization_id or target_place.status <> 'active' then
    raise exception 'Target place is not active in this organization.';
  end if;

  select * into destination_order
  from public.orders
  where organization_id = source_order.organization_id
    and place_id = target_place.id
    and status in ('open', 'waiting_payment')
    and id <> source_order.id
  order by opened_at asc
  limit 1
  for update;

  if destination_order.id is not null and destination_order.status = 'waiting_payment' then
    raise exception 'Target order is waiting for payment and cannot be merged.';
  end if;
  if exists (
    select 1 from public.order_adjustment_requests
    where order_id in (source_order.id, destination_order.id) and status = 'pending'
  ) then
    raise exception 'Resolve pending order adjustments before moving the order.';
  end if;
  if destination_order.id is null and exists (
    select 1 from public.timed_sessions
    where organization_id = source_order.organization_id and place_id = target_place.id and status = 'active'
  ) then
    raise exception 'Target place has an active session without an open order.';
  end if;

  select id into active_session_id
  from public.timed_sessions
  where order_id = source_order.id and status = 'active'
  for update;

  if active_session_id is not null then
    perform public.complete_timed_session(active_session_id);
  end if;

  if destination_order.id is null then
    select * into source_order
    from public.move_open_order_to_place(target_order_id, target_place_id, target_comment);

    perform public.log_audit(
      source_order.organization_id,
      'order.transferred',
      'order',
      source_order.id,
      jsonb_build_object(
        'from_place_id', source_place_id,
        'to_place_id', target_place_id,
        'completed_session_id', active_session_id,
        'new_session_started', false,
        'manual_session_start_available', target_place.has_timer
      )
    );
    return source_order;
  end if;

  perform set_config('app.order_write', '1', true);

  insert into public.order_place_history (
    organization_id, order_id, from_place_id, to_place_id,
    from_place_name_snapshot, to_place_name_snapshot, moved_by, comment
  ) values (
    source_order.organization_id, source_order.id, source_place_id, target_place.id,
    source_order.current_place_name_snapshot, target_place.name, auth.uid(), target_comment
  );

  update public.order_items set order_id = destination_order.id, updated_at = now() where order_id = source_order.id;
  update public.stock_reservations set order_id = destination_order.id where order_id = source_order.id;
  update public.payments set order_id = destination_order.id, updated_at = now() where order_id = source_order.id;
  update public.timed_sessions set order_id = destination_order.id, updated_at = now() where order_id = source_order.id;
  update public.order_adjustment_requests set order_id = destination_order.id where order_id = source_order.id;

  update public.orders
  set
    customer_label = case
      when nullif(btrim(destination_order.customer_label), '') is null then source_order.customer_label
      when nullif(btrim(source_order.customer_label), '') is null then destination_order.customer_label
      when btrim(destination_order.customer_label) = btrim(source_order.customer_label) then destination_order.customer_label
      else concat(destination_order.customer_label, ' + ', source_order.customer_label)
    end,
    comment = nullif(concat_ws(E'\n', destination_order.comment, source_order.comment), ''),
    updated_at = now()
  where id = destination_order.id;

  update public.orders
  set
    place_id = null,
    status = 'moved',
    subtotal = 0,
    total_amount = 0,
    paid_amount = 0,
    unpaid_amount = 0,
    moved_to_order_id = destination_order.id,
    moved_to_order_number_snapshot = destination_order.order_number,
    moved_to_place_name_snapshot = target_place.name,
    moved_at = now(),
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = source_order.id;

  select * into destination_order from public.recalculate_order_totals(destination_order.id);

  perform public.log_audit(
    destination_order.organization_id,
    'order.merged',
    'order',
    destination_order.id,
    jsonb_build_object(
      'source_order_id', source_order.id,
      'source_order_number', source_order.order_number,
      'from_place_id', source_place_id,
      'to_place_id', target_place.id,
      'completed_session_id', active_session_id
    )
  );
  perform public.log_audit(
    source_order.organization_id,
    'order.merged_into',
    'order',
    source_order.id,
    jsonb_build_object(
      'destination_order_id', destination_order.id,
      'destination_order_number', destination_order.order_number,
      'to_place_id', target_place.id,
      'to_place_name', target_place.name
    )
  );

  return destination_order;
end;
$$;

create or replace function public.merge_open_order_into_unplaced_order(
  source_order_id uuid,
  destination_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  source_order public.orders;
  destination_order public.orders;
  active_session_id uuid;
begin
  if source_order_id = destination_order_id then raise exception 'Source and destination orders must be different.'; end if;

  select * into source_order from public.orders where id = source_order_id for update;
  select * into destination_order from public.orders where id = destination_order_id for update;

  if source_order.id is null or destination_order.id is null then raise exception 'Order was not found.'; end if;
  if source_order.status <> 'open' or destination_order.status <> 'open' then raise exception 'Only open orders can be merged.'; end if;
  if source_order.organization_id <> destination_order.organization_id then raise exception 'Orders must belong to the same organization.'; end if;
  if destination_order.place_id is not null then raise exception 'Destination order must be without a place.'; end if;
  if not public.can_work_with_orders(source_order.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (
    select 1 from public.order_adjustment_requests
    where order_id in (source_order.id, destination_order.id) and status = 'pending'
  ) then
    raise exception 'Resolve pending order adjustments before moving the order.';
  end if;

  select id into active_session_id
  from public.timed_sessions
  where order_id = source_order.id and status = 'active'
  for update;
  if active_session_id is not null then perform public.complete_timed_session(active_session_id); end if;

  perform set_config('app.order_write', '1', true);

  insert into public.order_place_history (
    organization_id, order_id, from_place_id, to_place_id,
    from_place_name_snapshot, to_place_name_snapshot, moved_by, comment
  ) values (
    source_order.organization_id, source_order.id, source_order.place_id, null,
    source_order.current_place_name_snapshot, null, auth.uid(), 'Merged into an unplaced order.'
  );

  update public.order_items set order_id = destination_order.id, updated_at = now() where order_id = source_order.id;
  update public.stock_reservations set order_id = destination_order.id where order_id = source_order.id;
  update public.payments set order_id = destination_order.id, updated_at = now() where order_id = source_order.id;
  update public.timed_sessions set order_id = destination_order.id, updated_at = now() where order_id = source_order.id;
  update public.order_adjustment_requests set order_id = destination_order.id where order_id = source_order.id;

  update public.orders
  set
    customer_label = case
      when nullif(btrim(destination_order.customer_label), '') is null then source_order.customer_label
      when nullif(btrim(source_order.customer_label), '') is null then destination_order.customer_label
      when btrim(destination_order.customer_label) = btrim(source_order.customer_label) then destination_order.customer_label
      else concat(destination_order.customer_label, ' + ', source_order.customer_label)
    end,
    comment = nullif(concat_ws(E'\n', destination_order.comment, source_order.comment), ''),
    updated_at = now()
  where id = destination_order.id;

  update public.orders
  set
    place_id = null,
    status = 'moved',
    subtotal = 0,
    total_amount = 0,
    paid_amount = 0,
    unpaid_amount = 0,
    moved_to_order_id = destination_order.id,
    moved_to_order_number_snapshot = destination_order.order_number,
    moved_to_place_name_snapshot = destination_order.current_place_name_snapshot,
    moved_at = now(),
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = source_order.id;

  select * into destination_order from public.recalculate_order_totals(destination_order.id);

  perform public.log_audit(
    destination_order.organization_id,
    'order.merged',
    'order',
    destination_order.id,
    jsonb_build_object(
      'source_order_id', source_order.id,
      'source_order_number', source_order.order_number,
      'from_place_id', source_order.place_id,
      'destination_unplaced_order_id', destination_order.id,
      'completed_session_id', active_session_id
    )
  );
  perform public.log_audit(
    source_order.organization_id,
    'order.merged_into',
    'order',
    source_order.id,
    jsonb_build_object(
      'destination_order_id', destination_order.id,
      'destination_order_number', destination_order.order_number,
      'destination_has_place', false
    )
  );

  return destination_order;
end;
$$;

with latest_move as (
  select distinct on (al.entity_id)
    al.entity_id as source_order_id,
    nullif(al.metadata ->> 'destination_order_id', '')::uuid as destination_order_id,
    nullif(al.metadata ->> 'destination_order_number', '')::bigint as destination_order_number,
    nullif(al.metadata ->> 'to_place_name', '') as destination_place_name,
    al.created_at as moved_at
  from public.audit_logs al
  where al.action = 'order.merged_into'
    and al.entity_type = 'order'
    and al.entity_id is not null
  order by al.entity_id, al.created_at desc
)
update public.orders source
set
  status = 'moved',
  moved_to_order_id = move.destination_order_id,
  moved_to_order_number_snapshot = coalesce(move.destination_order_number, destination.order_number),
  moved_to_place_name_snapshot = coalesce(
    move.destination_place_name,
    destination.current_place_name_snapshot
  ),
  moved_at = move.moved_at,
  closed_at = coalesce(source.closed_at, move.moved_at),
  updated_at = now()
from latest_move move
left join public.orders destination on destination.id = move.destination_order_id
where source.id = move.source_order_id
  and source.status = 'cancelled';

create or replace function public.attach_shift_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  role_value public.app_role;
  shift_id uuid;
begin
  role_value := public.current_user_role();

  if role_value = 'employee' then
    shift_id := public.current_employee_open_shift_id(new.organization_id);
    if shift_id is null then
      raise exception 'Open shift is required for employee operations.';
    end if;
  end if;

  if tg_table_name = 'orders' then
    if tg_op = 'INSERT' and new.opened_shift_id is null then
      new.opened_shift_id := shift_id;
    elsif tg_op = 'UPDATE'
      and new.status in ('paid', 'payment_refused', 'moved', 'cancelled')
      and old.status is distinct from new.status
      and new.closed_shift_id is null
    then
      new.closed_shift_id := shift_id;
    end if;
  elsif tg_table_name = 'payments' then
    if tg_op = 'INSERT' and new.shift_id is null then
      new.shift_id := shift_id;
    end if;
  elsif tg_table_name = 'timed_sessions' then
    if tg_op = 'INSERT' and new.started_shift_id is null then
      new.started_shift_id := shift_id;
    elsif tg_op = 'UPDATE'
      and new.status = 'completed'
      and old.status is distinct from new.status
      and new.ended_shift_id is null
    then
      new.ended_shift_id := shift_id;
    end if;
  elsif tg_table_name = 'order_adjustment_requests' then
    if tg_op = 'INSERT' and new.shift_id is null then
      new.shift_id := shift_id;
    end if;
  end if;

  return new;
end;
$$;

grant execute on function public.transfer_open_order_to_place(uuid, uuid, text) to authenticated;
grant execute on function public.merge_open_order_into_unplaced_order(uuid, uuid) to authenticated;
