-- Save an optional order comment when an employee closes an order.
-- Existing RPC signatures stay available; the app uses these overloads when a comment is provided.

create or replace function public.complete_order_payment(
  target_order_id uuid,
  target_method public.payment_method,
  target_comment text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  normalized_comment text;
begin
  normalized_comment := nullif(btrim(coalesce(target_comment, '')), '');

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be paid in current status.'; end if;
  if order_row.total_amount <= 0 then raise exception 'Order total must be greater than zero.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;
  if exists (select 1 from public.order_adjustment_requests where order_id = order_row.id and status = 'pending') then
    raise exception 'Pending adjustment requests must be reviewed first.';
  end if;
  if exists (select 1 from public.payments where order_id = order_row.id and status = 'completed') then
    raise exception 'Order already has completed payment.';
  end if;

  perform set_config('app.order_write', '1', true);

  insert into public.payments (
    organization_id,
    order_id,
    method,
    status,
    amount,
    received_by,
    completed_at
  )
  values (
    order_row.organization_id,
    order_row.id,
    target_method,
    'completed',
    order_row.total_amount,
    auth.uid(),
    now()
  );

  perform public.consume_order_stock(order_row.id);

  update public.orders
  set
    status = 'paid',
    comment = normalized_comment,
    paid_amount = total_amount,
    unpaid_amount = 0,
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  perform public.sync_order_income(order_row.id);
  perform public.log_audit(
    order_row.organization_id,
    'payment.completed',
    'order',
    order_row.id,
    jsonb_build_object('method', target_method, 'amount', order_row.total_amount, 'comment', normalized_comment)
  );

  return order_row;
end;
$$;

create or replace function public.complete_order_payment_with_tip(
  target_order_id uuid,
  target_method public.payment_method,
  target_tip_amount numeric default 0,
  target_comment text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  tip_amount numeric(14,2);
  tip_item_id uuid;
  normalized_comment text;
begin
  tip_amount := round(coalesce(target_tip_amount, 0)::numeric, 2);
  normalized_comment := nullif(btrim(coalesce(target_comment, '')), '');
  if tip_amount < 0 then raise exception 'Tip amount cannot be negative.'; end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be paid in current status.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;
  if exists (select 1 from public.order_adjustment_requests where order_id = order_row.id and status = 'pending') then
    raise exception 'Pending adjustment requests must be reviewed first.';
  end if;
  if exists (select 1 from public.payments where order_id = order_row.id and status = 'completed') then
    raise exception 'Order already has completed payment.';
  end if;

  perform set_config('app.order_write', '1', true);

  select id into tip_item_id
  from public.order_items
  where order_id = order_row.id
    and item_type = 'manual_item'
    and metadata ->> 'system_code' = 'tip'
    and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if tip_amount > 0 then
    if tip_item_id is null then
      insert into public.order_items (
        organization_id,
        order_id,
        item_type,
        name_snapshot,
        description_snapshot,
        quantity,
        unit_price,
        total_price,
        metadata,
        added_by
      )
      values (
        order_row.organization_id,
        order_row.id,
        'manual_item',
        'Чаевые',
        'Дополнительная сумма от клиента',
        1,
        tip_amount,
        tip_amount,
        jsonb_build_object('system_code', 'tip', 'tip_amount', tip_amount),
        auth.uid()
      );
    else
      update public.order_items
      set
        quantity = 1,
        unit_price = tip_amount,
        total_price = tip_amount,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('system_code', 'tip', 'tip_amount', tip_amount),
        updated_at = now()
      where id = tip_item_id;
    end if;
  elsif tip_item_id is not null then
    update public.order_items
    set
      status = 'removed',
      removed_by = auth.uid(),
      removed_at = now(),
      removal_reason = 'Tip amount is zero.',
      updated_at = now()
    where id = tip_item_id;
  end if;

  order_row := public.recalculate_order_totals(order_row.id);

  perform public.log_audit(
    order_row.organization_id,
    'payment.tip_recorded',
    'order',
    order_row.id,
    jsonb_build_object('tip_amount', tip_amount, 'total_amount', order_row.total_amount)
  );

  return public.complete_order_payment(order_row.id, target_method, normalized_comment);
end;
$$;

create or replace function public.complete_opening_day_order_payment(
  target_order_id uuid,
  target_method public.payment_method,
  target_amount numeric,
  target_comment text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  payment_amount numeric(14,2);
  shift_id uuid;
  normalized_comment text;
begin
  payment_amount := round(coalesce(target_amount, 0)::numeric, 2);
  normalized_comment := nullif(btrim(coalesce(target_comment, '')), '');
  if payment_amount < 0 then raise exception 'Payment amount cannot be negative.'; end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be paid in current status.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;
  if exists (select 1 from public.order_adjustment_requests where order_id = order_row.id and status = 'pending') then
    raise exception 'Pending adjustment requests must be reviewed first.';
  end if;
  if exists (select 1 from public.payments where order_id = order_row.id and status = 'completed') then
    raise exception 'Order already has completed payment.';
  end if;

  shift_id := coalesce(order_row.opened_shift_id, public.current_employee_open_shift_id(order_row.organization_id));
  if not public.is_opening_day_shift(shift_id) then
    raise exception 'Manual opening day payment is available only for opening day shifts.';
  end if;

  perform set_config('app.order_write', '1', true);

  update public.order_items
  set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'opening_day_original_unit_price', unit_price,
      'opening_day_original_total_price', total_price
    ),
    unit_price = 0,
    total_price = 0,
    updated_at = now()
  where order_id = order_row.id
    and status = 'active'
    and item_type <> 'manual_item';

  if payment_amount > 0 then
    insert into public.order_items (
      organization_id,
      order_id,
      item_type,
      name_snapshot,
      description_snapshot,
      quantity,
      unit_price,
      total_price,
      metadata,
      added_by
    )
    values (
      order_row.organization_id,
      order_row.id,
      'manual_item',
      'День открытия',
      'Фактическая сумма от клиента',
      1,
      payment_amount,
      payment_amount,
      jsonb_build_object('opening_day_manual_amount', true),
      auth.uid()
    );
  end if;

  order_row := public.recalculate_order_totals(order_row.id);

  if payment_amount > 0 then
    insert into public.payments (
      organization_id,
      order_id,
      method,
      status,
      amount,
      received_by,
      completed_at
    )
    values (
      order_row.organization_id,
      order_row.id,
      target_method,
      'completed',
      payment_amount,
      auth.uid(),
      now()
    );
  end if;

  perform public.consume_order_stock(order_row.id);

  update public.orders
  set
    status = 'paid',
    comment = normalized_comment,
    total_amount = payment_amount,
    subtotal = payment_amount,
    paid_amount = payment_amount,
    unpaid_amount = 0,
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  if payment_amount > 0 then
    perform public.sync_order_income(order_row.id);
  end if;

  perform public.log_audit(
    order_row.organization_id,
    'payment.completed',
    'order',
    order_row.id,
    jsonb_build_object('method', target_method, 'amount', payment_amount, 'opening_day_mode', true, 'comment', normalized_comment)
  );

  return order_row;
end;
$$;

create or replace function public.complete_empty_order(
  target_order_id uuid,
  target_comment text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  normalized_comment text;
begin
  normalized_comment := nullif(btrim(coalesce(target_comment, '')), '');

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be completed in current status.'; end if;
  if order_row.total_amount > 0 then raise exception 'Only zero-total orders can be completed without payment.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;
  if exists (select 1 from public.order_adjustment_requests where order_id = order_row.id and status = 'pending') then
    raise exception 'Pending adjustment requests must be reviewed first.';
  end if;

  perform set_config('app.order_write', '1', true);

  update public.orders
  set
    status = 'paid',
    comment = normalized_comment,
    paid_amount = 0,
    unpaid_amount = 0,
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  perform public.log_audit(
    order_row.organization_id,
    'order.completed_empty',
    'order',
    order_row.id,
    jsonb_build_object('amount', 0, 'comment', normalized_comment)
  );

  return order_row;
end;
$$;

grant execute on function public.complete_order_payment(uuid, public.payment_method, text) to authenticated;
grant execute on function public.complete_order_payment_with_tip(uuid, public.payment_method, numeric, text) to authenticated;
grant execute on function public.complete_opening_day_order_payment(uuid, public.payment_method, numeric, text) to authenticated;
grant execute on function public.complete_empty_order(uuid, text) to authenticated;
