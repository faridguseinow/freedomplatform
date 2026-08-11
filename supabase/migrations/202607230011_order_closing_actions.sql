-- Direct employee actions for closing empty orders and cancelling active orders.

create or replace function public.complete_empty_order(target_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
begin
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
    paid_amount = 0,
    unpaid_amount = 0,
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  perform public.log_audit(order_row.organization_id, 'order.completed_empty', 'order', order_row.id, jsonb_build_object('amount', 0));

  return order_row;
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
begin
  if length(btrim(coalesce(target_reason, ''))) = 0 then raise exception 'Cancellation reason is required.'; end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be cancelled in current status.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;

  perform set_config('app.order_write', '1', true);
  perform set_config('app.inventory_write', '1', true);

  update public.order_items
  set
    status = 'cancelled',
    removed_by = auth.uid(),
    removed_at = now(),
    removal_reason = target_reason,
    updated_at = now()
  where order_id = order_row.id
    and status = 'active';

  update public.stock_reservations
  set
    status = 'cancelled',
    released_at = now()
  where order_id = order_row.id
    and status = 'active';

  update public.orders
  set
    status = 'cancelled',
    closed_by = auth.uid(),
    closed_at = now(),
    comment = nullif(btrim(concat_ws(E'\n', nullif(comment, ''), 'Отмена: ' || target_reason)), ''),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  perform public.log_audit(order_row.organization_id, 'order.cancelled', 'order', order_row.id, jsonb_build_object('reason', target_reason));

  return order_row;
end;
$$;

grant execute on function public.complete_empty_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
