-- Opening day shift mode: no price-list calculation in the employee workspace.
-- The final order amount is entered manually at payment time.

create or replace function public.is_opening_day_shift_name(target_name text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(target_name, ''))) in ('день открытия', 'opening ceremony', 'opening day');
$$;

create or replace function public.is_opening_day_shift(target_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.is_opening_day_shift_name(st.name)
    from public.employee_shifts es
    join public.shift_templates st on st.id = es.shift_template_id
    join public.organizations o on o.id = es.organization_id
    where es.id = target_shift_id
      and o.slug = 'the-liga'
  ), false);
$$;

alter table public.shift_templates disable trigger shift_templates_write_guard;

insert into public.shift_templates (
  organization_id,
  name,
  start_time,
  end_time,
  crosses_midnight,
  sort_order,
  is_active,
  expected_duration_minutes,
  late_close_grace_minutes,
  created_by
)
select
  o.id,
  'День открытия',
  null,
  null,
  false,
  0,
  true,
  null,
  0,
  om.user_id
from public.organizations o
join lateral (
  select user_id
  from public.organization_memberships
  where organization_id = o.id
    and role = 'organization_admin'
  order by is_active desc, created_at asc
  limit 1
) om on true
where o.slug = 'the-liga'
  and not exists (
  select 1
  from public.shift_templates st
  where st.organization_id = o.id
    and public.is_opening_day_shift_name(st.name)
);

alter table public.shift_templates enable trigger shift_templates_write_guard;

create or replace function public.complete_timed_session(target_session_id uuid)
returns public.timed_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.timed_sessions;
  actual integer;
  billable integer;
  amount numeric(14,2);
  existing_item_id uuid;
  opening_day_mode boolean;
begin
  select * into session_row from public.timed_sessions where id = target_session_id for update;
  if session_row.id is null then raise exception 'Timed session was not found.'; end if;
  if not public.can_work_with_orders(session_row.organization_id) then raise exception 'You do not have access to this session.'; end if;
  if session_row.status = 'completed' then return session_row; end if;
  if session_row.status <> 'active' then raise exception 'Only active sessions can be completed.'; end if;

  opening_day_mode := public.is_opening_day_shift(
    coalesce(session_row.started_shift_id, public.current_employee_open_shift_id(session_row.organization_id))
  );

  actual := greatest(1, ceil(extract(epoch from (now() - session_row.started_at)) / 60.0)::integer);
  if opening_day_mode then
    billable := actual;
    amount := 0;
  elsif actual <= session_row.minimum_minutes_snapshot then
    billable := session_row.minimum_minutes_snapshot;
    amount := round((session_row.hourly_rate_snapshot * billable / 60.0)::numeric, 2);
  else
    billable := session_row.minimum_minutes_snapshot
      + ceil((actual - session_row.minimum_minutes_snapshot)::numeric / session_row.billing_step_minutes_snapshot)::integer
      * session_row.billing_step_minutes_snapshot;
    amount := round((session_row.hourly_rate_snapshot * billable / 60.0)::numeric, 2);
  end if;

  perform set_config('app.order_write', '1', true);

  update public.timed_sessions
  set
    status = 'completed',
    ended_at = now(),
    actual_minutes = actual,
    billable_minutes = billable,
    calculated_amount = amount,
    ended_by = auth.uid(),
    updated_at = now()
  where id = session_row.id
  returning * into session_row;

  select id into existing_item_id
  from public.order_items
  where timed_session_id = session_row.id
  limit 1;

  if existing_item_id is null then
    insert into public.order_items (
      organization_id,
      order_id,
      item_type,
      timed_session_id,
      name_snapshot,
      description_snapshot,
      quantity,
      unit_price,
      total_price,
      metadata,
      added_by
    )
    values (
      session_row.organization_id,
      session_row.order_id,
      'timed_session',
      session_row.id,
      session_row.place_name_snapshot,
      session_row.service_name_snapshot,
      1,
      amount,
      amount,
      jsonb_build_object(
        'actual_minutes', actual,
        'billable_minutes', billable,
        'hourly_rate', session_row.hourly_rate_snapshot,
        'opening_day_mode', opening_day_mode
      ),
      auth.uid()
    );
  end if;

  perform public.recalculate_order_totals(session_row.order_id);
  perform public.log_audit(
    session_row.organization_id,
    'session.completed',
    'timed_session',
    session_row.id,
    jsonb_build_object(
      'order_id', session_row.order_id,
      'amount', amount,
      'billable_minutes', billable,
      'opening_day_mode', opening_day_mode
    )
  );

  return session_row;
end;
$$;

create or replace function public.complete_opening_day_order_payment(
  target_order_id uuid,
  target_method public.payment_method,
  target_amount numeric
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  payment_amount numeric(14,2);
  shift_id uuid;
begin
  payment_amount := round(coalesce(target_amount, 0)::numeric, 2);
  if payment_amount < 0 then raise exception 'Payment amount cannot be negative.'; end if;

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

  shift_id := coalesce(order_row.opened_shift_id, public.current_employee_open_shift_id(order_row.organization_id));
  if not public.is_opening_day_shift(shift_id) then
    raise exception 'Manual opening day payment is available only for opening day shifts.';
  end if;

  perform set_config('app.order_write', '1', true);

  update public.order_items
  set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'opening_day_original_unit_price', unit_price,
      'opening_day_original_total_price', total_price
    ),
    unit_price = 0,
    total_price = 0,
    updated_at = now()
  where order_id = order_row.id
    and status = 'active'
    and item_type <> 'manual_item';

  if payment_amount > 0 then
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
      'День открытия',
      'Фактическая сумма от клиента',
      1,
      payment_amount,
      payment_amount,
      jsonb_build_object('opening_day_manual_amount', true),
      auth.uid()
    );
  end if;

  order_row := public.recalculate_order_totals(order_row.id);

  if payment_amount > 0 then
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
      target_method,
      'completed',
      payment_amount,
      auth.uid(),
      now()
    );
  end if;

  perform public.consume_order_stock(order_row.id);

  update public.orders
  set
    status = 'paid',
    total_amount = payment_amount,
    subtotal = payment_amount,
    paid_amount = payment_amount,
    unpaid_amount = 0,
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  if payment_amount > 0 then
    perform public.sync_order_income(order_row.id);
  end if;

  perform public.log_audit(
    order_row.organization_id,
    'payment.completed',
    'order',
    order_row.id,
    jsonb_build_object('method', target_method, 'amount', payment_amount, 'opening_day_mode', true)
  );

  return order_row;
end;
$$;

grant execute on function public.is_opening_day_shift_name(text) to authenticated;
grant execute on function public.is_opening_day_shift(uuid) to authenticated;
grant execute on function public.complete_opening_day_order_payment(uuid, public.payment_method, numeric) to authenticated;
