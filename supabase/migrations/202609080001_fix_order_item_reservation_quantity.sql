-- Keep stock reservations in sync when an order item quantity changes.
-- The previous implementation subtracted the full delta from every reservation row,
-- which attempted to write zero when the same product was added several times.

create or replace function public.sync_order_item_stock_reservations(
  target_order_item_id uuid,
  target_quantity numeric
)
returns void
language plpgsql
set search_path = public
as $$
declare
  item_row public.order_items;
  requirement_row record;
  reservation_row public.stock_reservations;
  reservation_delta numeric(14,3);
  remaining_to_release numeric(14,3);
  available_quantity numeric;
  product_tracks_stock boolean;
begin
  select * into item_row
  from public.order_items
  where id = target_order_item_id
  for update;

  if item_row.id is null then raise exception 'Order item was not found.'; end if;
  if target_quantity is null or target_quantity <= 0 then raise exception 'Requested quantity is required.'; end if;

  for requirement_row in
    select requirement.product_id, sum(requirement.quantity_per_item)::numeric(14,3) as quantity_per_item
    from (
      select item_row.product_id, 1::numeric as quantity_per_item
      where item_row.item_type = 'product' and item_row.product_id is not null

      union all

      select component.product_id, component.quantity
      from public.order_combo_components component
      where item_row.item_type = 'combo'
        and component.order_item_id = item_row.id
        and component.component_type = 'product'
        and component.product_id is not null
    ) requirement
    group by requirement.product_id
  loop
    reservation_delta := requirement_row.quantity_per_item * (target_quantity - item_row.quantity);

    if reservation_delta > 0 then
      select track_stock into product_tracks_stock
      from public.products
      where id = requirement_row.product_id
      for update;

      if coalesce(product_tracks_stock, false) then
        available_quantity := public.calculate_available_product_stock(requirement_row.product_id);
        if available_quantity < reservation_delta then
          raise exception 'Not enough available stock for quantity increase.';
        end if;

        insert into public.stock_reservations (
          organization_id,
          order_id,
          order_item_id,
          product_id,
          quantity,
          created_by
        )
        values (
          item_row.organization_id,
          item_row.order_id,
          item_row.id,
          requirement_row.product_id,
          reservation_delta,
          auth.uid()
        );
      end if;
    elsif reservation_delta < 0 then
      remaining_to_release := abs(reservation_delta);

      for reservation_row in
        select *
        from public.stock_reservations
        where order_item_id = item_row.id
          and product_id = requirement_row.product_id
          and status = 'active'
        order by created_at desc, id desc
        for update
      loop
        exit when remaining_to_release <= 0;

        if reservation_row.quantity <= remaining_to_release then
          update public.stock_reservations
          set status = 'released', released_at = now()
          where id = reservation_row.id;
          remaining_to_release := remaining_to_release - reservation_row.quantity;
        else
          update public.stock_reservations
          set quantity = quantity - remaining_to_release
          where id = reservation_row.id;
          remaining_to_release := 0;
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public.sync_order_item_stock_reservations(uuid, numeric) from public, anon, authenticated;

create or replace function public.request_order_adjustment(
  target_order_id uuid,
  target_order_item_id uuid default null,
  target_request_type public.adjustment_request_type default 'other',
  target_reason text default null,
  target_requested_quantity numeric default null
)
returns public.order_adjustment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  item_row public.order_items;
  request_row public.order_adjustment_requests;
begin
  if length(btrim(coalesce(target_reason, ''))) = 0 then raise exception 'Reason is required.'; end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Only active orders can be corrected.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;

  if target_request_type in ('remove_order_item', 'change_quantity') and target_order_item_id is null then
    raise exception 'Order item is required for this correction.';
  end if;

  if target_order_item_id is not null then
    select * into item_row
    from public.order_items
    where id = target_order_item_id and order_id = order_row.id
    for update;
    if item_row.id is null then raise exception 'Order item was not found.'; end if;
  end if;

  perform set_config('app.order_write', '1', true);

  if target_request_type = 'remove_order_item' then
    if item_row.status <> 'active' then raise exception 'Only active items can be removed.'; end if;

    update public.order_items
    set status = 'removed', removed_by = auth.uid(), removed_at = now(), removal_reason = target_reason, updated_at = now()
    where id = item_row.id;

    perform public.release_order_item_reservations(item_row.id, 'released');
    perform public.recalculate_order_totals(order_row.id);
  elsif target_request_type = 'change_quantity' then
    if item_row.status <> 'active' then raise exception 'Only active items can be changed.'; end if;
    if target_requested_quantity is null or target_requested_quantity <= 0 then raise exception 'Requested quantity is required.'; end if;
    if item_row.item_type = 'timed_session' then raise exception 'Timed session item quantity cannot be changed.'; end if;

    perform public.sync_order_item_stock_reservations(item_row.id, target_requested_quantity);

    update public.order_items
    set
      quantity = target_requested_quantity,
      total_price = unit_price * target_requested_quantity,
      total_cost_snapshot = coalesce(unit_cost_snapshot, 0) * target_requested_quantity,
      updated_at = now()
    where id = item_row.id;

    perform public.recalculate_order_totals(order_row.id);
  elsif target_request_type = 'cancel_order' then
    update public.order_items
    set status = 'cancelled', removed_by = auth.uid(), removed_at = now(), removal_reason = target_reason, updated_at = now()
    where order_id = order_row.id
      and status = 'active';

    update public.stock_reservations
    set status = 'cancelled', released_at = now()
    where order_id = order_row.id
      and status = 'active';

    update public.orders
    set status = 'cancelled', closed_by = auth.uid(), closed_at = now(), updated_at = now()
    where id = order_row.id;
  end if;

  insert into public.order_adjustment_requests (
    organization_id,
    order_id,
    order_item_id,
    request_type,
    status,
    requested_quantity,
    reason,
    requested_by,
    requested_at,
    reviewed_by,
    reviewed_at,
    review_comment,
    expires_at
  )
  values (
    order_row.organization_id,
    order_row.id,
    target_order_item_id,
    target_request_type,
    'approved',
    target_requested_quantity,
    target_reason,
    auth.uid(),
    now(),
    auth.uid(),
    now(),
    'Applied automatically by employee action',
    null
  )
  returning * into request_row;

  perform public.log_audit(
    order_row.organization_id,
    'adjustment.requested',
    'order_adjustment_request',
    request_row.id,
    jsonb_build_object('type', target_request_type, 'order_id', order_row.id)
  );

  return request_row;
end;
$$;

