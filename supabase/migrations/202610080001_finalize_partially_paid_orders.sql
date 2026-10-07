-- Finalize orders after item-level prepayments without counting revenue twice.

drop index if exists public.payments_one_completed_payment_per_order_idx;

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
  payment_amount numeric(14,2);
  normalized_comment text;
begin
  normalized_comment := nullif(btrim(coalesce(target_comment, '')), '');

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

  perform set_config('app.order_write', '1', true);
  order_row := public.recalculate_order_totals(order_row.id);

  if order_row.total_amount <= 0 then raise exception 'Order total must be greater than zero.'; end if;
  payment_amount := order_row.unpaid_amount;

  if payment_amount > 0 then
    insert into public.payments (
      organization_id, order_id, method, status, amount, received_by, completed_at
    ) values (
      order_row.organization_id, order_row.id, target_method, 'completed', payment_amount, auth.uid(), now()
    );
  end if;

  order_row := public.recalculate_order_totals(order_row.id);
  if order_row.unpaid_amount > 0.01 then
    raise exception 'Order still has an unpaid balance.';
  end if;

  perform public.consume_order_stock(order_row.id);

  update public.orders
  set
    status = 'paid',
    comment = normalized_comment,
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
    jsonb_build_object(
      'method', target_method,
      'amount', payment_amount,
      'total_amount', order_row.total_amount,
      'paid_amount', order_row.paid_amount,
      'comment', normalized_comment
    )
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
        organization_id, order_id, item_type, name_snapshot, description_snapshot,
        quantity, unit_price, total_price, metadata, added_by
      ) values (
        order_row.organization_id, order_row.id, 'manual_item', 'Чаевые',
        'Дополнительная сумма от клиента', 1, tip_amount, tip_amount,
        jsonb_build_object('system_code', 'tip', 'tip_amount', tip_amount), auth.uid()
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

  perform public.recalculate_order_totals(order_row.id);
  return public.complete_order_payment(order_row.id, target_method, normalized_comment);
end;
$$;

create or replace function public.complete_order_split_payment_with_tip(
  target_order_id uuid,
  target_cash_amount numeric default 0,
  target_card_amount numeric default 0,
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
  cash_amount numeric(14,2);
  card_amount numeric(14,2);
  tip_amount numeric(14,2);
  total_paid_amount numeric(14,2);
  tip_item_id uuid;
  normalized_comment text;
begin
  cash_amount := round(coalesce(target_cash_amount, 0)::numeric, 2);
  card_amount := round(coalesce(target_card_amount, 0)::numeric, 2);
  tip_amount := round(coalesce(target_tip_amount, 0)::numeric, 2);
  normalized_comment := nullif(btrim(coalesce(target_comment, '')), '');

  if cash_amount < 0 or card_amount < 0 or tip_amount < 0 then
    raise exception 'Payment amounts cannot be negative.';
  end if;
  total_paid_amount := cash_amount + card_amount;

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
        organization_id, order_id, item_type, name_snapshot, description_snapshot,
        quantity, unit_price, total_price, metadata, added_by
      ) values (
        order_row.organization_id, order_row.id, 'manual_item', 'Чаевые',
        'Дополнительная сумма от клиента', 1, tip_amount, tip_amount,
        jsonb_build_object('system_code', 'tip', 'tip_amount', tip_amount), auth.uid()
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
  if order_row.total_amount <= 0 then raise exception 'Order total must be greater than zero.'; end if;
  if abs(total_paid_amount - order_row.unpaid_amount) > 0.01 then
    raise exception 'Split payment total must match the unpaid order amount.';
  end if;

  if cash_amount > 0 then
    insert into public.payments (
      organization_id, order_id, method, status, amount, received_by, completed_at
    ) values (
      order_row.organization_id, order_row.id, 'cash', 'completed', cash_amount, auth.uid(), now()
    );
  end if;

  if card_amount > 0 then
    insert into public.payments (
      organization_id, order_id, method, status, amount, received_by, completed_at
    ) values (
      order_row.organization_id, order_row.id, 'card_transfer', 'completed', card_amount, auth.uid(), now()
    );
  end if;

  order_row := public.recalculate_order_totals(order_row.id);
  if order_row.unpaid_amount > 0.01 then
    raise exception 'Order still has an unpaid balance.';
  end if;

  perform public.consume_order_stock(order_row.id);

  update public.orders
  set
    status = 'paid',
    comment = normalized_comment,
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
    jsonb_build_object(
      'cash_amount', cash_amount,
      'card_amount', card_amount,
      'amount', total_paid_amount,
      'total_amount', order_row.total_amount,
      'paid_amount', order_row.paid_amount,
      'comment', normalized_comment
    )
  );

  return order_row;
end;
$$;

create or replace function public.complete_order_split_payment(
  target_order_id uuid,
  target_cash_amount numeric default 0,
  target_card_amount numeric default 0,
  target_comment text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.complete_order_split_payment_with_tip(
    target_order_id,
    target_cash_amount,
    target_card_amount,
    0,
    target_comment
  );
end;
$$;

create or replace function public.cancel_order(
  target_order_id uuid,
  target_reason text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  refunded_amount numeric(14,2);
begin
  if length(btrim(coalesce(target_reason, ''))) = 0 then raise exception 'Cancellation reason is required.'; end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be cancelled in current status.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;

  select coalesce(sum(amount), 0)::numeric(14,2)
  into refunded_amount
  from public.payments
  where order_id = order_row.id and status = 'completed';

  update public.payments
  set
    status = 'refunded',
    cancelled_at = now(),
    cancellation_reason = target_reason,
    updated_at = now()
  where order_id = order_row.id and status = 'completed';

  perform set_config('app.order_write', '1', true);
  perform set_config('app.inventory_write', '1', true);

  update public.order_items
  set
    status = 'cancelled',
    removed_by = auth.uid(),
    removed_at = now(),
    removal_reason = target_reason,
    updated_at = now()
  where order_id = order_row.id and status = 'active';

  update public.stock_reservations
  set status = 'cancelled', released_at = now()
  where order_id = order_row.id and status = 'active';

  update public.orders
  set
    status = 'cancelled',
    paid_amount = 0,
    unpaid_amount = 0,
    closed_by = auth.uid(),
    closed_at = now(),
    comment = nullif(btrim(concat_ws(E'\n', nullif(comment, ''), 'Отмена: ' || target_reason)), ''),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  perform public.log_audit(
    order_row.organization_id,
    'order.cancelled',
    'order',
    order_row.id,
    jsonb_build_object('reason', target_reason, 'refunded_amount', refunded_amount)
  );

  return order_row;
end;
$$;

grant execute on function public.complete_order_payment(uuid, public.payment_method, text) to authenticated;
grant execute on function public.complete_order_payment_with_tip(uuid, public.payment_method, numeric, text) to authenticated;
grant execute on function public.complete_order_split_payment_with_tip(uuid, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.complete_order_split_payment(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
