-- Allocate every partial payment to exact order items and quantities.

create table if not exists public.order_item_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  quantity numeric(12,3) not null,
  unit_price numeric(14,2) not null,
  amount numeric(14,2) not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint order_item_payment_allocations_quantity_check check (quantity > 0),
  constraint order_item_payment_allocations_price_check check (unit_price >= 0),
  constraint order_item_payment_allocations_amount_check check (amount > 0),
  constraint order_item_payment_allocations_payment_item_key unique (payment_id, order_item_id)
);

create index if not exists order_item_payment_allocations_order_idx
on public.order_item_payment_allocations (order_id);
create index if not exists order_item_payment_allocations_item_idx
on public.order_item_payment_allocations (order_item_id);

alter table public.order_item_payment_allocations enable row level security;
drop policy if exists "Order item allocations readable by organization members" on public.order_item_payment_allocations;
create policy "Order item allocations readable by organization members"
on public.order_item_payment_allocations for select to authenticated
using (public.is_organization_member(organization_id));

create or replace function public.allocate_completed_payment_to_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_row public.order_items;
  paid_quantity numeric(12,3);
  available_quantity numeric(12,3);
  allocated_quantity numeric(12,3);
  allocated_amount numeric(14,2);
  remaining_amount numeric(14,2);
begin
  if new.status <> 'completed'
    or coalesce(current_setting('app.item_payment_mode', true), '') = 'selected_items'
  then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then return new; end if;

  remaining_amount := new.amount;

  for item_row in
    select * from public.order_items
    where order_id = new.order_id and status = 'active' and unit_price > 0
    order by added_at, id
    for update
  loop
    select coalesce(sum(a.quantity), 0)
    into paid_quantity
    from public.order_item_payment_allocations a
    join public.payments p on p.id = a.payment_id and p.status = 'completed'
    where a.order_item_id = item_row.id;

    available_quantity := greatest(0, item_row.quantity - paid_quantity);
    if available_quantity <= 0 or remaining_amount <= 0 then continue; end if;

    allocated_quantity := least(available_quantity, remaining_amount / item_row.unit_price);
    allocated_amount := least(remaining_amount, round(item_row.unit_price * allocated_quantity, 2));
    if allocated_amount <= 0 then continue; end if;

    insert into public.order_item_payment_allocations (
      organization_id, order_id, order_item_id, payment_id,
      quantity, unit_price, amount, created_by
    ) values (
      new.organization_id, new.order_id, item_row.id, new.id,
      allocated_quantity, item_row.unit_price, allocated_amount, new.received_by
    );

    remaining_amount := remaining_amount - allocated_amount;
  end loop;

  return new;
end;
$$;

drop trigger if exists allocate_completed_payment_to_items_trigger on public.payments;
create trigger allocate_completed_payment_to_items_trigger
after insert or update of status on public.payments
for each row execute function public.allocate_completed_payment_to_items();

create or replace function public.protect_paid_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  paid_quantity numeric(12,3);
begin
  select coalesce(sum(a.quantity), 0)
  into paid_quantity
  from public.order_item_payment_allocations a
  join public.payments p on p.id = a.payment_id and p.status = 'completed'
  where a.order_item_id = old.id;

  if paid_quantity <= 0 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'A paid order item cannot be deleted without a refund.';
  end if;
  if new.status <> 'active' then
    raise exception 'A paid order item cannot be removed without a refund.';
  end if;
  if new.quantity < paid_quantity then
    raise exception 'Order item quantity cannot be lower than its paid quantity.';
  end if;
  if new.unit_price is distinct from old.unit_price then
    raise exception 'The price of a paid order item cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_paid_order_item_trigger on public.order_items;
create trigger protect_paid_order_item_trigger
before update or delete on public.order_items
for each row execute function public.protect_paid_order_item();

create or replace function public.pay_order_items(
  target_order_id uuid,
  target_items jsonb,
  target_method public.payment_method
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  item_row public.order_items;
  request_row record;
  paid_quantity numeric(12,3);
  available_quantity numeric(12,3);
  payment_amount numeric(14,2) := 0;
  payment_row public.payments;
  requested_count integer := 0;
begin
  if target_items is null or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'Select at least one order item.';
  end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status <> 'open' then raise exception 'Only an open order can receive item payments.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (
    select 1 from public.order_adjustment_requests
    where order_id = order_row.id and status = 'pending'
  ) then
    raise exception 'Pending adjustment requests must be reviewed first.';
  end if;

  perform set_config('app.order_write', '1', true);
  order_row := public.recalculate_order_totals(order_row.id);

  for request_row in
    select
      (entry ->> 'order_item_id')::uuid as order_item_id,
      sum((entry ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(target_items) entry
    group by (entry ->> 'order_item_id')::uuid
  loop
    requested_count := requested_count + 1;
    if request_row.quantity is null or request_row.quantity <= 0 then
      raise exception 'Payment quantity must be greater than zero.';
    end if;

    select * into item_row
    from public.order_items
    where id = request_row.order_item_id and order_id = order_row.id and status = 'active'
    for update;

    if item_row.id is null then raise exception 'Order item was not found.'; end if;
    if item_row.unit_price <= 0 then raise exception 'A zero-price item does not require payment.'; end if;

    select coalesce(sum(a.quantity), 0)
    into paid_quantity
    from public.order_item_payment_allocations a
    join public.payments p on p.id = a.payment_id and p.status = 'completed'
    where a.order_item_id = item_row.id;

    available_quantity := greatest(0, item_row.quantity - paid_quantity);
    if request_row.quantity > available_quantity then
      raise exception 'Requested quantity exceeds the unpaid quantity.';
    end if;

    payment_amount := payment_amount + round(item_row.unit_price * request_row.quantity, 2);
  end loop;

  if requested_count = 0 or payment_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if payment_amount > order_row.unpaid_amount then
    raise exception 'Payment amount exceeds the current unpaid order amount.';
  end if;

  perform set_config('app.item_payment_mode', 'selected_items', true);
  insert into public.payments (
    organization_id, order_id, method, status, amount, received_by, completed_at
  ) values (
    order_row.organization_id, order_row.id, target_method, 'completed', payment_amount, auth.uid(), now()
  ) returning * into payment_row;

  for request_row in
    select
      (entry ->> 'order_item_id')::uuid as order_item_id,
      sum((entry ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(target_items) entry
    group by (entry ->> 'order_item_id')::uuid
  loop
    select * into item_row from public.order_items where id = request_row.order_item_id;
    insert into public.order_item_payment_allocations (
      organization_id, order_id, order_item_id, payment_id,
      quantity, unit_price, amount, created_by
    ) values (
      order_row.organization_id, order_row.id, item_row.id, payment_row.id,
      request_row.quantity, item_row.unit_price,
      round(item_row.unit_price * request_row.quantity, 2), auth.uid()
    );
  end loop;

  perform set_config('app.order_write', '1', true);
  order_row := public.recalculate_order_totals(order_row.id);

  perform public.log_audit(
    order_row.organization_id,
    'payment.items_paid',
    'order',
    order_row.id,
    jsonb_build_object(
      'method', target_method,
      'amount', payment_amount,
      'items_count', requested_count,
      'remaining', order_row.unpaid_amount
    )
  );

  return order_row;
end;
$$;

grant execute on function public.pay_order_items(uuid, jsonb, public.payment_method) to authenticated;

-- Preserve open-order prepayments created before item allocations existed.
do $$
declare
  payment_row public.payments;
  item_row public.order_items;
  paid_quantity numeric(12,3);
  available_quantity numeric(12,3);
  allocated_quantity numeric(12,3);
  allocated_amount numeric(14,2);
  remaining_amount numeric(14,2);
begin
  for payment_row in
    select p.* from public.payments p
    join public.orders o on o.id = p.order_id
    where p.status = 'completed' and o.status in ('open', 'waiting_payment')
    order by p.completed_at, p.created_at
  loop
    remaining_amount := payment_row.amount;
    for item_row in
      select * from public.order_items
      where order_id = payment_row.order_id and status = 'active' and unit_price > 0
      order by added_at, id
    loop
      select coalesce(sum(a.quantity), 0) into paid_quantity
      from public.order_item_payment_allocations a
      join public.payments p on p.id = a.payment_id and p.status = 'completed'
      where a.order_item_id = item_row.id;

      available_quantity := greatest(0, item_row.quantity - paid_quantity);
      if available_quantity <= 0 or remaining_amount <= 0 then continue; end if;
      allocated_quantity := least(available_quantity, remaining_amount / item_row.unit_price);
      allocated_amount := least(remaining_amount, round(item_row.unit_price * allocated_quantity, 2));
      if allocated_amount <= 0 then continue; end if;

      insert into public.order_item_payment_allocations (
        organization_id, order_id, order_item_id, payment_id,
        quantity, unit_price, amount, created_by
      ) values (
        payment_row.organization_id, payment_row.order_id, item_row.id, payment_row.id,
        allocated_quantity, item_row.unit_price, allocated_amount, payment_row.received_by
      ) on conflict (payment_id, order_item_id) do nothing;
      remaining_amount := remaining_amount - allocated_amount;
    end loop;
  end loop;
end;
$$;

create or replace view public.employee_order_items
with (security_invoker = false, security_barrier = true)
as
select
  oi.id,
  oi.organization_id,
  oi.order_id,
  oi.item_type,
  oi.status,
  oi.product_id,
  oi.service_id,
  oi.combo_id,
  oi.timed_session_id,
  oi.name_snapshot,
  oi.description_snapshot,
  oi.image_path_snapshot,
  oi.quantity,
  oi.unit_price,
  oi.total_price,
  oi.metadata,
  oi.added_by,
  oi.added_at,
  oi.removed_at,
  oi.removal_reason,
  oi.created_at,
  oi.updated_at,
  case when oi.unit_price <= 0 then oi.quantity else coalesce(paid.paid_quantity, 0) end as paid_quantity,
  case when oi.unit_price <= 0 then oi.total_price else coalesce(paid.paid_amount, 0) end as paid_amount
from public.order_items oi
left join lateral (
  select sum(a.quantity) as paid_quantity, sum(a.amount) as paid_amount
  from public.order_item_payment_allocations a
  join public.payments p on p.id = a.payment_id and p.status = 'completed'
  where a.order_item_id = oi.id
) paid on true
where public.is_organization_member(oi.organization_id);

grant select on public.employee_order_items to authenticated;
