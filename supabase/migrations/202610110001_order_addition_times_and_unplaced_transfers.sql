-- Keep every catalog addition as its own order row so its addition time remains visible.

create or replace function public.add_product_to_order(
  target_order_id uuid,
  target_product_id uuid,
  target_quantity numeric
)
returns public.order_items
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  product_row public.products;
  item_row public.order_items;
  available_quantity numeric;
begin
  if target_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status <> 'open' then raise exception 'Only open orders can be changed.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;

  select * into product_row from public.products where id = target_product_id for update;
  if product_row.id is null then raise exception 'Product was not found.'; end if;
  if product_row.organization_id <> order_row.organization_id or product_row.status <> 'active' then
    raise exception 'Product is not active in this organization.';
  end if;

  if product_row.track_stock then
    available_quantity := public.calculate_available_product_stock(product_row.id);
    if available_quantity < target_quantity then
      raise exception 'Not enough available stock for product %. Available: %.', product_row.name, available_quantity;
    end if;
  end if;

  perform set_config('app.order_write', '1', true);

  insert into public.order_items (
    organization_id, order_id, item_type, product_id, name_snapshot,
    description_snapshot, image_path_snapshot, quantity, unit_price,
    total_price, unit_cost_snapshot, total_cost_snapshot, added_by
  ) values (
    order_row.organization_id, order_row.id, 'product', product_row.id, product_row.name,
    product_row.description, product_row.image_path, target_quantity, product_row.sale_price,
    product_row.sale_price * target_quantity, product_row.average_purchase_cost,
    product_row.average_purchase_cost * target_quantity, auth.uid()
  ) returning * into item_row;

  if product_row.track_stock then
    insert into public.stock_reservations (
      organization_id, order_id, order_item_id, product_id, quantity, created_by
    ) values (
      order_row.organization_id, order_row.id, item_row.id, product_row.id, target_quantity, auth.uid()
    );
  end if;

  perform public.recalculate_order_totals(order_row.id);
  perform public.log_audit(
    order_row.organization_id,
    'order.item_added',
    'order_item',
    item_row.id,
    jsonb_build_object('type', 'product', 'product_id', product_row.id, 'quantity', target_quantity)
  );

  return item_row;
end;
$$;

create or replace function public.add_service_to_order(
  target_order_id uuid,
  target_service_id uuid,
  target_quantity numeric default 1
)
returns public.order_items
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  service_row public.services;
  item_row public.order_items;
begin
  if target_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status <> 'open' then raise exception 'Only open orders can be changed.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;

  select * into service_row from public.services where id = target_service_id;
  if service_row.id is null then raise exception 'Service was not found.'; end if;
  if service_row.organization_id <> order_row.organization_id or service_row.status <> 'active' then
    raise exception 'Service is not active in this organization.';
  end if;
  if service_row.pricing_type <> 'fixed' then
    raise exception 'Hourly services must be added through timed sessions.';
  end if;

  perform set_config('app.order_write', '1', true);

  insert into public.order_items (
    organization_id, order_id, item_type, service_id, name_snapshot,
    description_snapshot, image_path_snapshot, quantity, unit_price, total_price, added_by
  ) values (
    order_row.organization_id, order_row.id, 'service', service_row.id, service_row.name,
    service_row.description, service_row.image_path, target_quantity, service_row.fixed_price,
    service_row.fixed_price * target_quantity, auth.uid()
  ) returning * into item_row;

  perform public.recalculate_order_totals(order_row.id);
  perform public.log_audit(
    order_row.organization_id,
    'order.item_added',
    'order_item',
    item_row.id,
    jsonb_build_object('type', 'service', 'service_id', service_row.id, 'quantity', target_quantity)
  );

  return item_row;
end;
$$;

-- Merge an open order into a selected open order that intentionally has no place.

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
  if source_order_id = destination_order_id then
    raise exception 'Source and destination orders must be different.';
  end if;

  select * into source_order
  from public.orders
  where id = source_order_id
  for update;

  select * into destination_order
  from public.orders
  where id = destination_order_id
  for update;

  if source_order.id is null or destination_order.id is null then
    raise exception 'Order was not found.';
  end if;
  if source_order.status <> 'open' or destination_order.status <> 'open' then
    raise exception 'Only open orders can be merged.';
  end if;
  if source_order.organization_id <> destination_order.organization_id then
    raise exception 'Orders must belong to the same organization.';
  end if;
  if destination_order.place_id is not null then
    raise exception 'Destination order must be without a place.';
  end if;
  if not public.can_work_with_orders(source_order.organization_id) then
    raise exception 'You do not have access to this order.';
  end if;
  if exists (
    select 1
    from public.order_adjustment_requests
    where order_id in (source_order.id, destination_order.id)
      and status = 'pending'
  ) then
    raise exception 'Resolve pending order adjustments before moving the order.';
  end if;

  select id into active_session_id
  from public.timed_sessions
  where order_id = source_order.id and status = 'active'
  for update;

  if active_session_id is not null then
    perform public.complete_timed_session(active_session_id);
  end if;

  perform set_config('app.order_write', '1', true);

  insert into public.order_place_history (
    organization_id, order_id, from_place_id, to_place_id,
    from_place_name_snapshot, to_place_name_snapshot, moved_by, comment
  ) values (
    source_order.organization_id, source_order.id, source_order.place_id, null,
    source_order.current_place_name_snapshot, null, auth.uid(), 'Merged into an unplaced order.'
  );

  update public.order_items set order_id = destination_order.id, updated_at = now()
  where order_id = source_order.id;
  update public.stock_reservations set order_id = destination_order.id
  where order_id = source_order.id;
  update public.payments set order_id = destination_order.id, updated_at = now()
  where order_id = source_order.id;
  update public.timed_sessions set order_id = destination_order.id, updated_at = now()
  where order_id = source_order.id;
  update public.order_adjustment_requests set order_id = destination_order.id
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

grant execute on function public.add_product_to_order(uuid, uuid, numeric) to authenticated;
grant execute on function public.add_service_to_order(uuid, uuid, numeric) to authenticated;
grant execute on function public.merge_open_order_into_unplaced_order(uuid, uuid) to authenticated;
