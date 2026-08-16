-- Allow employees to name open orders that are not tied to a place.

create or replace function public.update_order_customer_label(
  target_order_id uuid,
  target_customer_label text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  normalized_label text;
begin
  select * into order_row
  from public.orders
  where id = target_order_id
  for update;

  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if order_row.place_id is not null then raise exception 'Only orders without a place can be renamed here.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Only active orders can be renamed.'; end if;

  normalized_label := nullif(btrim(coalesce(target_customer_label, '')), '');

  perform set_config('app.order_write', '1', true);

  update public.orders
  set
    customer_label = normalized_label,
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  perform public.log_audit(
    order_row.organization_id,
    'order.customer_label_updated',
    'order',
    order_row.id,
    jsonb_build_object('customer_label', normalized_label)
  );

  return order_row;
end;
$$;
