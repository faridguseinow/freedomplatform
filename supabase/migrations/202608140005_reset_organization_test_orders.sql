-- Platform-owner maintenance tool for clearing test order activity while keeping catalog and real expenses.

create or replace function public.prevent_order_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.system_purge', true) = '1' then
      return old;
    end if;
    raise exception 'Physical delete is not allowed for order records.';
  end if;

  if current_setting('app.order_write', true) <> '1' then
    raise exception 'Order records can be changed only through order RPC functions.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_finance_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.system_purge', true) = '1' then
      return old;
    end if;
    raise exception 'Physical delete is not allowed for finance records.';
  end if;

  if auth.role() = 'service_role' then
    return coalesce(new, old);
  end if;

  if current_setting('app.finance_write', true) <> '1' then
    raise exception 'Finance records can be changed only through finance RPC functions.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_shift_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.system_purge', true) = '1' then
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

create or replace function public.prevent_stock_movement_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.system_purge', true) = '1' then
      return old;
    end if;
    raise exception 'Stock movements are immutable.';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Stock movements are immutable.';
  end if;

  if current_setting('app.inventory_write', true) <> '1' then
    raise exception 'Stock movements can be created only by inventory functions.';
  end if;

  return new;
end;
$$;

create or replace function public.reset_organization_test_orders(
  target_organization_id uuid,
  target_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_row public.organizations;
  affected_product_ids uuid[];
  affected_product_id uuid;
  orders_deleted integer;
  payments_deleted integer;
  order_income_deleted integer;
  stock_movements_deleted integer;
  operational_days_deleted integer;
  shifts_deleted integer;
  audit_logs_deleted integer;
  finance_audit_logs_deleted integer;
  financial_periods_deleted integer;
  platform_share_transactions_deleted integer;
  result jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can reset organization test orders.';
  end if;

  if target_confirmation <> 'RESET_TEST_ORDERS' then
    raise exception 'Invalid reset confirmation.';
  end if;

  select * into organization_row
  from public.organizations
  where id = target_organization_id;

  if organization_row.id is null then
    raise exception 'Organization was not found.';
  end if;

  select coalesce(array_agg(distinct product_id), '{}')
  into affected_product_ids
  from public.stock_movements
  where organization_id = target_organization_id
    and reference_type = 'order'
    and product_id is not null;

  select count(*)::integer into orders_deleted
  from public.orders
  where organization_id = target_organization_id;

  select count(*)::integer into payments_deleted
  from public.payments
  where organization_id = target_organization_id;

  select count(*)::integer into order_income_deleted
  from public.finance_transactions
  where organization_id = target_organization_id
    and transaction_type = 'income'
    and source_type = 'order';

  select count(*)::integer into stock_movements_deleted
  from public.stock_movements
  where organization_id = target_organization_id
    and reference_type = 'order';

  select count(*)::integer into operational_days_deleted
  from public.operational_days
  where organization_id = target_organization_id;

  select count(*)::integer into shifts_deleted
  from public.employee_shifts
  where organization_id = target_organization_id;

  select count(*)::integer into financial_periods_deleted
  from public.financial_periods
  where organization_id = target_organization_id;

  select count(*)::integer into platform_share_transactions_deleted
  from public.finance_transactions
  where organization_id = target_organization_id
    and source_type = 'platform_share';

  perform set_config('app.system_purge', '1', true);
  perform set_config('app.order_write', '1', true);
  perform set_config('app.finance_write', '1', true);
  perform set_config('app.shift_write', '1', true);
  perform set_config('app.inventory_write', '1', true);

  delete from public.finance_audit_logs
  where organization_id = target_organization_id
    and action in (
      'finance.order_income_synced',
      'finance.period_submitted',
      'finance.period_approved',
      'finance.period_rejected',
      'finance.period_clarification_requested',
      'finance.platform_share_payment_reported',
      'finance.platform_share_payment_confirmed',
      'finance.platform_share_payment_rejected'
    );
  get diagnostics finance_audit_logs_deleted = row_count;

  delete from public.audit_logs
  where organization_id = target_organization_id
    and (
      entity_type in (
        'order',
        'order_item',
        'order_adjustment_request',
        'timed_session',
        'employee_shift',
        'shift_handover',
        'operational_day'
      )
      or action like 'order.%'
      or action like 'adjustment.%'
      or action like 'session.%'
      or action like 'payment.%'
      or action like 'shift.%'
      or action like 'operational_day.%'
    );
  get diagnostics audit_logs_deleted = row_count;

  delete from public.notification_outbox
  where organization_id = target_organization_id
    and entity_type in ('order', 'order_item', 'order_adjustment_request', 'employee_shift', 'shift_handover');

  delete from public.financial_periods
  where organization_id = target_organization_id;

  delete from public.finance_transactions
  where organization_id = target_organization_id
    and (
      (transaction_type = 'income' and source_type = 'order')
      or source_type = 'platform_share'
    );

  delete from public.stock_movements
  where organization_id = target_organization_id
    and reference_type = 'order';

  delete from public.orders
  where organization_id = target_organization_id;

  delete from public.operational_days
  where organization_id = target_organization_id;

  if affected_product_ids is not null then
    foreach affected_product_id in array affected_product_ids loop
      perform public.reconcile_product_stock(affected_product_id);
    end loop;
  end if;

  result := jsonb_build_object(
    'organization_id', target_organization_id,
    'organization_name', organization_row.name,
    'orders_deleted', orders_deleted,
    'payments_deleted', payments_deleted,
    'order_income_deleted', order_income_deleted,
    'stock_movements_deleted', stock_movements_deleted,
    'operational_days_deleted', operational_days_deleted,
    'shifts_deleted', shifts_deleted,
    'financial_periods_deleted', financial_periods_deleted,
    'platform_share_transactions_deleted', platform_share_transactions_deleted,
    'audit_logs_deleted', audit_logs_deleted,
    'finance_audit_logs_deleted', finance_audit_logs_deleted,
    'affected_products', coalesce(array_length(affected_product_ids, 1), 0)
  );

  perform public.log_audit(
    target_organization_id,
    'maintenance.test_orders_reset',
    'organization',
    target_organization_id,
    result
  );

  return result;
end;
$$;

grant execute on function public.reset_organization_test_orders(uuid, text) to authenticated;
