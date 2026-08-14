-- Apply employee order corrections immediately and keep order_adjustment_requests as an audit/notification log.

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
  product_row public.products;
  request_row public.order_adjustment_requests;
  delta numeric(14,3);
  available_quantity numeric;
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
    select * into item_row from public.order_items where id = target_order_item_id and order_id = order_row.id for update;
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

    delta := target_requested_quantity - item_row.quantity;
    if delta > 0 and item_row.item_type = 'product' then
      select * into product_row from public.products where id = item_row.product_id for update;
      if product_row.track_stock then
        available_quantity := public.calculate_available_product_stock(product_row.id);
        if available_quantity < delta then
          raise exception 'Not enough available stock for quantity increase.';
        end if;
        insert into public.stock_reservations (organization_id, order_id, order_item_id, product_id, quantity, created_by)
        values (item_row.organization_id, item_row.order_id, item_row.id, product_row.id, delta, auth.uid());
      end if;
    elsif delta < 0 then
      update public.stock_reservations
      set quantity = greatest(quantity + delta, 0)
      where order_item_id = item_row.id
        and status = 'active';

      update public.stock_reservations
      set status = 'released', released_at = now()
      where order_item_id = item_row.id
        and status = 'active'
        and quantity <= 0;
    end if;

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
    'adjustment.applied',
    'order_adjustment_request',
    request_row.id,
    jsonb_build_object('type', target_request_type, 'order_id', order_row.id)
  );

  return request_row;
end;
$$;
