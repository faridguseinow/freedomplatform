create or replace function public.update_customer_debt(
  target_debt_id uuid,
  target_customer_name text,
  target_customer_phone text,
  target_due_on date default null,
  target_comment text default null
)
returns public.customer_debts
language plpgsql
security definer
set search_path = public
as $$
declare
  debt_row public.customer_debts;
  next_customer_name text := btrim(coalesce(target_customer_name, ''));
  next_customer_phone text := btrim(coalesce(target_customer_phone, ''));
begin
  select * into debt_row from public.customer_debts where id = target_debt_id for update;
  if debt_row.id is null then raise exception 'Debt was not found.'; end if;
  if not public.is_organization_admin(debt_row.organization_id) then raise exception 'Only organization admins can edit debts.'; end if;
  if debt_row.status not in ('open', 'partial') then raise exception 'Only active debts can be edited.'; end if;
  if length(next_customer_name) < 2 then raise exception 'Customer name is required.'; end if;
  if length(next_customer_phone) < 5 then raise exception 'Customer phone is required.'; end if;
  if target_due_on is not null and target_due_on < debt_row.incurred_on then
    raise exception 'Debt due date cannot be earlier than debt date.';
  end if;

  update public.customer_debts
  set customer_name = next_customer_name,
      customer_phone = next_customer_phone,
      due_on = target_due_on,
      comment = nullif(btrim(coalesce(target_comment, '')), ''),
      updated_at = now()
  where id = debt_row.id
  returning * into debt_row;

  perform set_config('app.order_write', '1', true);
  update public.orders set customer_label = next_customer_name, updated_at = now() where id = debt_row.order_id;

  perform public.log_audit(
    debt_row.organization_id, 'debt.updated', 'customer_debt', debt_row.id,
    jsonb_build_object('order_id', debt_row.order_id, 'customer_name', next_customer_name, 'due_on', target_due_on)
  );
  return debt_row;
end;
$$;

create or replace function public.delete_customer_debt(
  target_debt_id uuid,
  target_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  debt_row public.customer_debts;
  reservation_row public.stock_reservations;
  product_row public.products;
  reason text := btrim(coalesce(target_reason, ''));
begin
  select * into debt_row from public.customer_debts where id = target_debt_id for update;
  if debt_row.id is null then raise exception 'Debt was not found.'; end if;
  if not public.is_organization_admin(debt_row.organization_id) then raise exception 'Only organization admins can delete debts.'; end if;
  if length(reason) < 3 then raise exception 'Deletion reason is required.'; end if;
  if debt_row.paid_amount > 0.01 or exists (select 1 from public.customer_debt_payments where debt_id = debt_row.id) then
    raise exception 'A debt with received payments cannot be deleted.';
  end if;
  if exists (select 1 from public.payments where order_id = debt_row.order_id and status = 'completed') then
    raise exception 'The related order has completed payments and cannot be deleted as debt.';
  end if;

  perform set_config('app.order_write', '1', true);
  perform set_config('app.inventory_write', '1', true);

  for reservation_row in
    select * from public.stock_reservations
    where order_id = debt_row.order_id and status = 'consumed'
    order by created_at asc
    for update
  loop
    select * into product_row from public.products where id = reservation_row.product_id for update;
    insert into public.stock_movements (
      organization_id, product_id, movement_type, quantity_delta, unit_cost, total_cost,
      reference_type, reference_id, comment, created_by
    ) values (
      reservation_row.organization_id, reservation_row.product_id, 'return_in', reservation_row.quantity,
      product_row.average_purchase_cost, reservation_row.quantity * product_row.average_purchase_cost,
      'debt_cancellation', reservation_row.id, 'Debt order cancellation', auth.uid()
    );

    update public.stock_reservations
    set status = 'cancelled', released_at = now()
    where id = reservation_row.id;
    perform public.reconcile_product_stock(reservation_row.product_id);
  end loop;

  update public.order_items
  set status = 'cancelled', removed_by = auth.uid(), removed_at = now(), removal_reason = reason, updated_at = now()
  where order_id = debt_row.order_id and status = 'active';

  update public.orders
  set status = 'cancelled', paid_amount = 0, unpaid_amount = 0, closed_by = auth.uid(), closed_at = now(),
      comment = nullif(btrim(concat_ws(E'\n', nullif(comment, ''), 'Borc silindi: ' || reason)), ''), updated_at = now()
  where id = debt_row.order_id;

  perform public.log_audit(
    debt_row.organization_id, 'debt.deleted', 'customer_debt', debt_row.id,
    jsonb_build_object('order_id', debt_row.order_id, 'order_number', debt_row.order_number_snapshot, 'amount', debt_row.original_amount, 'reason', reason)
  );

  delete from public.customer_debts where id = debt_row.id;
  return debt_row.id;
end;
$$;

grant execute on function public.update_customer_debt(uuid, text, text, date, text) to authenticated;
grant execute on function public.delete_customer_debt(uuid, text) to authenticated;

notify pgrst, 'reload schema';
