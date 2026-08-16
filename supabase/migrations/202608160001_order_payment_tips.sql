-- Store tips as a separate manual order line right before payment.
-- It keeps products/services clean while letting totals, payments and finance use the actual received amount.

create or replace function public.complete_order_payment_with_tip(
  target_order_id uuid,
  target_method public.payment_method,
  target_tip_amount numeric default 0
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
begin
  tip_amount := round(coalesce(target_tip_amount, 0)::numeric, 2);
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

  return public.complete_order_payment(order_row.id, target_method);
end;
$$;

grant execute on function public.complete_order_payment_with_tip(uuid, public.payment_method, numeric) to authenticated;
