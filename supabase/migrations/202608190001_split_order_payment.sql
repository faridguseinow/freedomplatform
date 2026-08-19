drop index if exists public.payments_one_completed_payment_per_order_idx;

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
declare
  order_row public.orders;
  cash_amount numeric(14,2);
  card_amount numeric(14,2);
  total_paid_amount numeric(14,2);
  normalized_comment text;
begin
  cash_amount := round(coalesce(target_cash_amount, 0)::numeric, 2);
  card_amount := round(coalesce(target_card_amount, 0)::numeric, 2);
  normalized_comment := nullif(btrim(coalesce(target_comment, '')), '');

  if cash_amount < 0 or card_amount < 0 then
    raise exception 'Split payment amounts cannot be negative.';
  end if;

  total_paid_amount := cash_amount + card_amount;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be paid in current status.'; end if;
  if order_row.total_amount <= 0 then raise exception 'Order total must be greater than zero.'; end if;
  if abs(total_paid_amount - order_row.total_amount) > 0.01 then
    raise exception 'Split payment total must match the order total.';
  end if;
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

  if cash_amount > 0 then
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
      'cash',
      'completed',
      cash_amount,
      auth.uid(),
      now()
    );
  end if;

  if card_amount > 0 then
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
      'card_transfer',
      'completed',
      card_amount,
      auth.uid(),
      now()
    );
  end if;

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
    jsonb_build_object(
      'cash_amount', cash_amount,
      'card_amount', card_amount,
      'amount', order_row.total_amount,
      'comment', normalized_comment
    )
  );

  return order_row;
end;
$$;

grant execute on function public.complete_order_split_payment(uuid, numeric, numeric, text) to authenticated;

create or replace function public.sync_order_income(target_order_id uuid)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  payment_total numeric(14,2);
  primary_payment_method public.payment_method;
  category_id uuid;
  transaction_row public.finance_transactions;
  business_date date;
  latest_payment_at timestamptz;
begin
  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status <> 'paid' then return null; end if;

  select
    sum(amount),
    max(completed_at),
    case
      when count(distinct method) = 1 then min(method)
      when sum(case when method = 'cash' then amount else 0 end) >= sum(case when method = 'card_transfer' then amount else 0 end) then 'cash'
      else 'card_transfer'
    end
  into payment_total, latest_payment_at, primary_payment_method
  from public.payments
  where order_id = order_row.id and status = 'completed';

  if payment_total is null then return null; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(order_row.organization_id) or public.can_work_with_orders(order_row.organization_id)) then
    raise exception 'You do not have access to this order.';
  end if;

  perform public.seed_standard_finance_categories(order_row.organization_id);

  select id into category_id
  from public.finance_categories
  where organization_id = order_row.organization_id and system_code = 'order_income'
  limit 1;

  business_date := public.get_business_date(order_row.organization_id, coalesce(latest_payment_at, now()));
  perform set_config('app.finance_write', '1', true);

  insert into public.finance_transactions (
    organization_id,
    transaction_type,
    category_id,
    source_type,
    source_id,
    title,
    amount,
    paid_amount,
    status,
    payment_method,
    accrual_date,
    paid_date,
    reference,
    affects_profit,
    affects_cash_flow,
    eligible_for_platform_share_deduction,
    created_by
  )
  values (
    order_row.organization_id,
    'income',
    category_id,
    'order',
    order_row.id,
    'Заказ #' || order_row.order_number::text,
    payment_total,
    payment_total,
    'paid',
    public.finance_payment_method_from_order(primary_payment_method),
    business_date,
    business_date,
    order_row.id::text,
    true,
    true,
    false,
    coalesce(order_row.closed_by, order_row.opened_by)
  )
  on conflict (organization_id, source_type, source_id)
  where source_type = 'order' and transaction_type = 'income' and source_id is not null
  do update set
    amount = excluded.amount,
    paid_amount = excluded.paid_amount,
    status = excluded.status,
    payment_method = excluded.payment_method,
    accrual_date = excluded.accrual_date,
    paid_date = excluded.paid_date,
    reference = excluded.reference,
    updated_at = now()
  returning * into transaction_row;

  perform public.finance_log(order_row.organization_id, 'finance.order_income_synced', 'finance_transaction', transaction_row.id, null, to_jsonb(transaction_row));
  return transaction_row;
end;
$$;

create or replace view public.order_financial_summary
with (security_barrier = true)
as
select
  o.organization_id,
  o.id as order_id,
  o.order_number,
  p.id as payment_id,
  case
    when count(distinct p.method) = 1 then min(p.method)
    when sum(case when p.method = 'cash' then p.amount else 0 end) >= sum(case when p.method = 'card_transfer' then p.amount else 0 end) then 'cash'
    else 'card_transfer'
  end as order_payment_method,
  case
    when count(distinct p.method) = 1 then public.finance_payment_method_from_order(min(p.method))
    when sum(case when p.method = 'cash' then p.amount else 0 end) >= sum(case when p.method = 'card_transfer' then p.amount else 0 end) then 'cash'::public.finance_payment_method
    else 'card_transfer'::public.finance_payment_method
  end as finance_payment_method,
  max(p.completed_at) as paid_at,
  public.get_business_date(o.organization_id, coalesce(max(p.completed_at), o.closed_at, o.updated_at)) as business_date,
  o.total_amount::numeric(14,2) as revenue,
  public.calculate_order_cost(o.id)::numeric(14,2) as cogs,
  (o.total_amount - public.calculate_order_cost(o.id))::numeric(14,2) as gross_profit,
  o.closed_shift_id,
  es.operational_day_id
from public.orders o
join public.payments p on p.order_id = o.id and p.status = 'completed'
left join public.employee_shifts es on es.id = o.closed_shift_id
where o.status = 'paid'
  and (public.is_platform_owner() or public.is_organization_admin(o.organization_id))
group by
  o.organization_id,
  o.id,
  o.order_number,
  p.id,
  o.total_amount,
  o.closed_shift_id,
  o.closed_at,
  o.updated_at,
  es.operational_day_id;
