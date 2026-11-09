do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'customer_debt_status') then
    create type public.customer_debt_status as enum ('open', 'partial', 'paid', 'written_off');
  end if;
end
$$;

create table if not exists public.customer_debts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  order_number_snapshot bigint not null,
  customer_name text not null,
  customer_phone text not null,
  original_amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,
  balance_amount numeric(14,2) not null,
  status public.customer_debt_status not null default 'open',
  incurred_on date not null,
  due_on date,
  comment text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint customer_debts_name_check check (length(btrim(customer_name)) >= 2),
  constraint customer_debts_phone_check check (length(btrim(customer_phone)) >= 5),
  constraint customer_debts_amount_check check (original_amount > 0 and paid_amount >= 0 and balance_amount >= 0)
);

create table if not exists public.customer_debt_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  debt_id uuid not null references public.customer_debts(id) on delete restrict,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null,
  shift_id uuid references public.employee_shifts(id) on delete set null,
  comment text,
  received_by uuid not null references auth.users(id),
  received_at timestamptz not null default now()
);

create index if not exists customer_debts_organization_status_idx on public.customer_debts (organization_id, status, created_at desc);
create index if not exists customer_debt_payments_debt_idx on public.customer_debt_payments (debt_id, received_at desc);

alter table public.customer_debts enable row level security;
alter table public.customer_debt_payments enable row level security;

drop policy if exists "Organization admins can read customer debts" on public.customer_debts;
create policy "Organization admins can read customer debts"
on public.customer_debts for select to authenticated
using (public.is_organization_admin(organization_id));

drop policy if exists "Organization admins can read customer debt payments" on public.customer_debt_payments;
create policy "Organization admins can read customer debt payments"
on public.customer_debt_payments for select to authenticated
using (public.is_organization_admin(organization_id));

create or replace function public.create_customer_debt(
  target_order_id uuid,
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
  order_row public.orders;
  debt_row public.customer_debts;
  shift_id uuid;
  business_date date;
  customer_name text := btrim(coalesce(target_customer_name, ''));
  customer_phone text := btrim(coalesce(target_customer_phone, ''));
begin
  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be recorded as debt in current status.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if length(customer_name) < 2 then raise exception 'Customer name is required.'; end if;
  if length(customer_phone) < 5 then raise exception 'Customer phone is required.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;
  if exists (select 1 from public.order_adjustment_requests where order_id = order_row.id and status = 'pending') then
    raise exception 'Pending adjustment requests must be reviewed first.';
  end if;

  shift_id := public.current_employee_open_shift_id(order_row.organization_id);
  if public.current_user_role() = 'employee' and shift_id is null then
    raise exception 'Open shift is required for employee operations.';
  end if;

  perform set_config('app.order_write', '1', true);
  order_row := public.recalculate_order_totals(order_row.id);
  if order_row.unpaid_amount <= 0 then raise exception 'Order has no unpaid amount.'; end if;

  business_date := public.get_business_date(order_row.organization_id, now());
  if target_due_on is not null and target_due_on < business_date then
    raise exception 'Debt due date cannot be earlier than debt date.';
  end if;
  insert into public.customer_debts (
    organization_id, order_id, order_number_snapshot, customer_name, customer_phone, original_amount,
    paid_amount, balance_amount, status, incurred_on, due_on, comment, created_by
  ) values (
    order_row.organization_id, order_row.id, order_row.order_number, customer_name, customer_phone, order_row.unpaid_amount,
    0, order_row.unpaid_amount, 'open', business_date, target_due_on,
    nullif(btrim(coalesce(target_comment, '')), ''), auth.uid()
  ) returning * into debt_row;

  perform public.consume_order_stock(order_row.id);
  update public.orders
  set status = 'unpaid', customer_label = customer_name, closed_by = auth.uid(), closed_at = now(),
      closed_shift_id = coalesce(closed_shift_id, shift_id), updated_at = now()
  where id = order_row.id;

  perform public.log_audit(
    order_row.organization_id, 'debt.created', 'customer_debt', debt_row.id,
    jsonb_build_object('order_id', order_row.id, 'amount', debt_row.original_amount, 'customer_name', customer_name, 'due_on', target_due_on)
  );
  return debt_row;
end;
$$;

create or replace function public.record_customer_debt_payment(
  target_debt_id uuid,
  target_amount numeric,
  target_method public.payment_method,
  target_comment text default null
)
returns public.customer_debts
language plpgsql
security definer
set search_path = public
as $$
declare
  debt_row public.customer_debts;
  payment_row public.payments;
  debt_payment_id uuid;
  shift_id uuid;
  category_id uuid;
  business_date date;
  amount numeric(14,2) := round(coalesce(target_amount, 0)::numeric, 2);
begin
  select * into debt_row from public.customer_debts where id = target_debt_id for update;
  if debt_row.id is null then raise exception 'Debt was not found.'; end if;
  if not public.is_organization_admin(debt_row.organization_id) then raise exception 'Only organization admins can receive debt payments.'; end if;
  if debt_row.status not in ('open', 'partial') then raise exception 'Debt cannot be paid in current status.'; end if;
  if amount <= 0 or amount > debt_row.balance_amount then raise exception 'Payment amount is invalid.'; end if;

  shift_id := public.current_employee_open_shift_id(debt_row.organization_id);
  perform set_config('app.order_write', '1', true);
  insert into public.payments (organization_id, order_id, method, status, amount, shift_id, received_by, completed_at)
  values (debt_row.organization_id, debt_row.order_id, target_method, 'completed', amount, shift_id, auth.uid(), now())
  returning * into payment_row;

  insert into public.customer_debt_payments (
    organization_id, debt_id, payment_id, amount, method, shift_id, comment, received_by, received_at
  ) values (
    debt_row.organization_id, debt_row.id, payment_row.id, amount, target_method, shift_id,
    nullif(btrim(coalesce(target_comment, '')), ''), auth.uid(), now()
  ) returning id into debt_payment_id;

  update public.customer_debts
  set paid_amount = paid_amount + amount,
      balance_amount = balance_amount - amount,
      status = case when balance_amount - amount <= 0.01 then 'paid'::public.customer_debt_status else 'partial'::public.customer_debt_status end,
      paid_at = case when balance_amount - amount <= 0.01 then now() else null end,
      updated_at = now()
  where id = debt_row.id
  returning * into debt_row;

  perform set_config('app.order_write', '1', true);
  perform public.recalculate_order_totals(debt_row.order_id);
  if debt_row.status = 'paid' then
    update public.orders set status = 'paid', unpaid_amount = 0, updated_at = now() where id = debt_row.order_id;
  end if;

  perform public.seed_standard_finance_categories(debt_row.organization_id);
  select id into category_id from public.finance_categories
  where organization_id = debt_row.organization_id and system_code = 'order_income' limit 1;
  business_date := public.get_business_date(debt_row.organization_id, now());
  perform set_config('app.finance_write', '1', true);
  insert into public.finance_transactions (
    organization_id, transaction_type, category_id, source_type, source_id, title, description,
    amount, paid_amount, status, payment_method, accrual_date, paid_date, reference,
    affects_profit, affects_cash_flow, eligible_for_platform_share_deduction, created_by
  ) values (
    debt_row.organization_id, 'income', category_id, 'manual', debt_payment_id,
    'Borc ödənişi: ' || debt_row.customer_name, nullif(btrim(coalesce(target_comment, '')), ''),
    amount, amount, 'paid', public.finance_payment_method_from_order(target_method), business_date, business_date,
    payment_row.id::text, true, true, false, auth.uid()
  );

  perform public.log_audit(
    debt_row.organization_id, 'debt.payment_received', 'customer_debt', debt_row.id,
    jsonb_build_object('order_id', debt_row.order_id, 'amount', amount, 'method', target_method, 'remaining', debt_row.balance_amount)
  );
  return debt_row;
end;
$$;

grant select on public.customer_debts, public.customer_debt_payments to authenticated;
grant execute on function public.create_customer_debt(uuid, text, text, date, text) to authenticated;
grant execute on function public.record_customer_debt_payment(uuid, numeric, public.payment_method, text) to authenticated;

notify pgrst, 'reload schema';
