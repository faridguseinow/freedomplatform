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
  select * into order_row
  from public.orders
  where id = target_order_id
  for update;

  if order_row.id is null then
    raise exception 'Order was not found.';
  end if;

  if order_row.status <> 'open' then
    raise exception 'Only open orders can be moved.';
  end if;

  if not public.can_work_with_orders(order_row.organization_id) then
    raise exception 'You do not have access to this order.';
  end if;

  if order_row.place_id = target_place_id then
    raise exception 'Order is already assigned to this place.';
  end if;

  source_place_id := order_row.place_id;

  select * into target_place
  from public.places
  where id = target_place_id
  for update;

  if target_place.id is null then
    raise exception 'Target place was not found.';
  end if;

  if target_place.organization_id <> order_row.organization_id or target_place.status <> 'active' then
    raise exception 'Target place is not active in this organization.';
  end if;

  if exists (
    select 1
    from public.orders
    where organization_id = order_row.organization_id
      and place_id = target_place.id
      and status in ('open', 'waiting_payment')
      and id <> order_row.id
  ) then
    raise exception 'Target place already has an active order.';
  end if;

  if exists (
    select 1
    from public.timed_sessions
    where organization_id = order_row.organization_id
      and place_id = target_place.id
      and status = 'active'
  ) then
    raise exception 'Target place already has an active timed session.';
  end if;

  select id into active_session_id
  from public.timed_sessions
  where order_id = order_row.id
    and status = 'active'
  for update;

  if active_session_id is not null then
    perform public.complete_timed_session(active_session_id);
  end if;

  select * into order_row
  from public.move_open_order_to_place(target_order_id, target_place_id, target_comment);

  perform public.log_audit(
    order_row.organization_id,
    'order.transferred',
    'order',
    order_row.id,
    jsonb_build_object(
      'from_place_id', source_place_id,
      'to_place_id', target_place_id,
      'completed_session_id', active_session_id,
      'new_session_started', false,
      'manual_session_start_available', target_place.has_timer
    )
  );

  select * into order_row
  from public.orders
  where id = target_order_id;

  return order_row;
end;
$$;

grant execute on function public.transfer_open_order_to_place(uuid, uuid, text) to authenticated;
