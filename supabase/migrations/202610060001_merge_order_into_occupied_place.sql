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
  select * into source_order
  from public.orders
  where id = target_order_id
  for update;

  if source_order.id is null then
    raise exception 'Order was not found.';
  end if;

  if source_order.status <> 'open' then
    raise exception 'Only open orders can be moved.';
  end if;

  if not public.can_work_with_orders(source_order.organization_id) then
    raise exception 'You do not have access to this order.';
  end if;

  if source_order.place_id = target_place_id then
    raise exception 'Order is already assigned to this place.';
  end if;

  source_place_id := source_order.place_id;

  select * into target_place
  from public.places
  where id = target_place_id
  for update;

  if target_place.id is null then
    raise exception 'Target place was not found.';
  end if;

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
    select 1
    from public.order_adjustment_requests
    where order_id in (source_order.id, destination_order.id)
      and status = 'pending'
  ) then
    raise exception 'Resolve pending order adjustments before moving the order.';
  end if;

  if destination_order.id is null and exists (
    select 1
    from public.timed_sessions
    where organization_id = source_order.organization_id
      and place_id = target_place.id
      and status = 'active'
  ) then
    raise exception 'Target place has an active session without an open order.';
  end if;

  select id into active_session_id
  from public.timed_sessions
  where order_id = source_order.id
    and status = 'active'
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

    select * into source_order
    from public.orders
    where id = target_order_id;

    return source_order;
  end if;

  perform set_config('app.order_write', '1', true);

  insert into public.order_place_history (
    organization_id,
    order_id,
    from_place_id,
    to_place_id,
    from_place_name_snapshot,
    to_place_name_snapshot,
    moved_by,
    comment
  )
  values (
    source_order.organization_id,
    source_order.id,
    source_place_id,
    target_place.id,
    source_order.current_place_name_snapshot,
    target_place.name,
    auth.uid(),
    target_comment
  );

  update public.order_items
  set order_id = destination_order.id,
      updated_at = now()
  where order_id = source_order.id;

  update public.stock_reservations
  set order_id = destination_order.id
  where order_id = source_order.id;

  update public.payments
  set order_id = destination_order.id,
      updated_at = now()
  where order_id = source_order.id;

  update public.timed_sessions
  set order_id = destination_order.id,
      updated_at = now()
  where order_id = source_order.id;

  update public.order_adjustment_requests
  set order_id = destination_order.id
  where order_id = source_order.id;

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
    status = 'cancelled',
    subtotal = 0,
    total_amount = 0,
    paid_amount = 0,
    unpaid_amount = 0,
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = source_order.id;

  select * into destination_order
  from public.recalculate_order_totals(destination_order.id);

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
      'to_place_id', target_place.id
    )
  );

  return destination_order;
end;
$$;

grant execute on function public.transfer_open_order_to_place(uuid, uuid, text) to authenticated;
