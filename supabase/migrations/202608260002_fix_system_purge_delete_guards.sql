create or replace function public.prevent_shift_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.system_purge', true) = '1'
      and current_setting('app.shift_hard_delete', true) = '1' then
      return old;
    end if;
    raise exception 'Physical delete is not allowed for shift records.';
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  if current_setting('app.shift_write', true) <> '1' then
    raise exception 'Shift records can be changed only through shift RPC functions.';
  end if;

  return new;
end;
$$;

create or replace function public.delete_employee_shift(
  target_shift_id uuid,
  target_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
  affected_order_ids uuid[];
  affected_order_item_ids uuid[];
  affected_product_ids uuid[];
  affected_payment_ids uuid[];
  deleted_finance_transactions integer := 0;
  deleted_stock_movements integer := 0;
  deleted_orders integer := 0;
  deleted_payments integer := 0;
  deleted_handovers integer := 0;
  deleted_shift integer := 0;
  affected_product_id uuid;
  result jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can permanently delete shifts.';
  end if;

  select *
  into shift_row
  from public.employee_shifts
  where id = target_shift_id
  for update;

  if shift_row.id is null then
    raise exception 'Shift was not found.';
  end if;

  select coalesce(array_agg(distinct order_id), '{}')
  into affected_order_ids
  from (
    select o.id as order_id
    from public.orders o
    where o.opened_shift_id = shift_row.id or o.closed_shift_id = shift_row.id
    union
    select p.order_id
    from public.payments p
    where p.shift_id = shift_row.id
    union
    select ts.order_id
    from public.timed_sessions ts
    where ts.started_shift_id = shift_row.id or ts.ended_shift_id = shift_row.id
  ) affected_orders
  where order_id is not null;

  select coalesce(array_agg(distinct id), '{}')
  into affected_payment_ids
  from public.payments
  where shift_id = shift_row.id
    or order_id = any(affected_order_ids);

  select coalesce(array_agg(distinct oi.id), '{}')
  into affected_order_item_ids
  from public.order_items oi
  where oi.order_id = any(affected_order_ids);

  select coalesce(array_agg(distinct sm.product_id), '{}')
  into affected_product_ids
  from public.stock_movements sm
  where sm.organization_id = shift_row.organization_id
    and sm.reference_type = 'order'
    and sm.reference_id = any(affected_order_item_ids)
    and sm.product_id is not null;

  perform set_config('app.system_purge', '1', true);
  perform set_config('app.shift_hard_delete', '1', true);
  perform set_config('app.order_write', '1', true);
  perform set_config('app.finance_write', '1', true);
  perform set_config('app.shift_write', '1', true);
  perform set_config('app.inventory_write', '1', true);

  delete from public.finance_transactions
  where organization_id = shift_row.organization_id
    and transaction_type = 'income'
    and source_type = 'order'
    and source_id = any(affected_order_ids);
  get diagnostics deleted_finance_transactions = row_count;

  delete from public.finance_audit_logs
  where organization_id = shift_row.organization_id
    and (
      entity_id = shift_row.id
      or entity_id = any(affected_order_ids)
      or entity_id = any(affected_payment_ids)
    );

  delete from public.audit_logs
  where organization_id = shift_row.organization_id
    and (
      entity_id = shift_row.id
      or entity_id = any(affected_order_ids)
      or entity_id = any(affected_payment_ids)
      or shift_id = shift_row.id
      or entity_type in ('shift_handover', 'shift_handover_order')
        and entity_id in (
          select id from public.shift_handovers where from_shift_id = shift_row.id or to_shift_id = shift_row.id
        )
      or action like 'shift.%'
        and entity_id = shift_row.id
    );

  delete from public.notification_outbox
  where organization_id = shift_row.organization_id
    and (
      entity_id = shift_row.id
      or entity_id = any(affected_order_ids)
      or entity_id = any(affected_payment_ids)
    );

  delete from public.stock_movements
  where organization_id = shift_row.organization_id
    and reference_type = 'order'
    and reference_id = any(affected_order_item_ids);
  get diagnostics deleted_stock_movements = row_count;

  delete from public.shift_handovers
  where from_shift_id = shift_row.id or to_shift_id = shift_row.id;
  get diagnostics deleted_handovers = row_count;

  delete from public.payments
  where id = any(affected_payment_ids);
  get diagnostics deleted_payments = row_count;

  delete from public.orders
  where id = any(affected_order_ids);
  get diagnostics deleted_orders = row_count;

  delete from public.employee_shifts
  where id = shift_row.id;
  get diagnostics deleted_shift = row_count;

  if affected_product_ids is not null then
    foreach affected_product_id in array affected_product_ids loop
      perform public.reconcile_product_stock(affected_product_id);
    end loop;
  end if;

  perform public.recalculate_operational_day(shift_row.operational_day_id);

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    shift_row.organization_id,
    auth.uid(),
    'shift.permanently_deleted',
    'employee_shift',
    shift_row.id,
    jsonb_build_object(
      'comment', target_comment,
      'business_date', shift_row.opened_at::date,
      'deleted_shift', deleted_shift,
      'deleted_orders', deleted_orders,
      'deleted_payments', deleted_payments,
      'deleted_finance_transactions', deleted_finance_transactions,
      'deleted_stock_movements', deleted_stock_movements,
      'deleted_handovers', deleted_handovers
    )
  );

  result := jsonb_build_object(
    'shift_id', shift_row.id,
    'organization_id', shift_row.organization_id,
    'operational_day_id', shift_row.operational_day_id,
    'deleted_shift', deleted_shift,
    'deleted_orders', deleted_orders,
    'deleted_payments', deleted_payments,
    'deleted_finance_transactions', deleted_finance_transactions,
    'deleted_stock_movements', deleted_stock_movements,
    'deleted_handovers', deleted_handovers
  );

  return result;
end;
$$;

grant execute on function public.delete_employee_shift(uuid, text) to authenticated;
