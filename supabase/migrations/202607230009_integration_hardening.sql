-- Integration hardening before first live organization launch.
-- This migration only strengthens the existing schema and RPC contracts.

create unique index if not exists finance_transactions_platform_share_source_unique_idx
on public.finance_transactions (organization_id, transaction_type, source_type, source_id)
where source_type = 'platform_share' and source_id is not null;

create unique index if not exists platform_share_rates_organization_effective_from_key
on public.organization_platform_share_rates (organization_id, effective_from);

create unique index if not exists shift_handover_orders_one_open_order_idx
on public.shift_handover_orders (organization_id, order_id)
where active_session_id is not null;

create or replace function public.assert_active_handover_order_unique()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.shift_handover_orders sho
    join public.shift_handovers sh on sh.id = sho.handover_id
    where sho.organization_id = new.organization_id
      and sho.order_id = new.order_id
      and sho.id <> coalesce(new.id, gen_random_uuid())
      and sh.status in ('pending', 'accepted')
  ) then
    raise exception 'Order already belongs to an active handover.';
  end if;

  return new;
end;
$$;

drop trigger if exists shift_handover_orders_active_unique on public.shift_handover_orders;
create trigger shift_handover_orders_active_unique before insert or update on public.shift_handover_orders
for each row execute function public.assert_active_handover_order_unique();

create or replace function public.prevent_locked_financial_period_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'locked' then
    raise exception 'Locked financial periods cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists financial_periods_locked_guard on public.financial_periods;
create trigger financial_periods_locked_guard before update on public.financial_periods
for each row execute function public.prevent_locked_financial_period_update();

create or replace function public.claim_notification_outbox(
  target_batch_size integer default 20,
  target_processing_timeout_minutes integer default 10
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_owner() then
    raise exception 'Only trusted workers can claim notification outbox.';
  end if;

  perform set_config('app.shift_write', '1', true);

  update public.notification_outbox
  set
    status = 'pending',
    processing_started_at = null,
    next_attempt_at = now(),
    updated_at = now()
  where status = 'processing'
    and processing_started_at < now() - make_interval(mins => greatest(target_processing_timeout_minutes, 1))
    and attempt_count < 5;

  return query
  with candidate as (
    select id
    from public.notification_outbox
    where status = 'pending'
      and next_attempt_at <= now()
      and attempt_count < 5
    order by created_at asc
    limit least(greatest(target_batch_size, 1), 100)
    for update skip locked
  )
  update public.notification_outbox nox
  set
    status = 'processing',
    processing_started_at = now(),
    updated_at = now()
  from candidate
  where nox.id = candidate.id
  returning nox.*;
end;
$$;

create or replace function public.finish_notification_outbox_item(
  target_outbox_id uuid,
  target_success boolean,
  target_error text default null,
  target_cancelled boolean default false
)
returns public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  outbox_row public.notification_outbox;
  next_attempt_count integer;
  retry_minutes integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_owner() then
    raise exception 'Only trusted workers can finish notification outbox items.';
  end if;

  select * into outbox_row
  from public.notification_outbox
  where id = target_outbox_id
  for update;

  if outbox_row.id is null then raise exception 'Notification outbox item was not found.'; end if;
  if outbox_row.status = 'sent' then return outbox_row; end if;

  perform set_config('app.shift_write', '1', true);

  if target_cancelled then
    update public.notification_outbox
    set
      status = 'cancelled',
      processing_started_at = null,
      last_error = null,
      updated_at = now()
    where id = target_outbox_id
    returning * into outbox_row;
  elsif target_success then
    update public.notification_outbox
    set
      status = 'sent',
      sent_at = now(),
      processing_started_at = null,
      last_error = null,
      updated_at = now()
    where id = target_outbox_id
    returning * into outbox_row;
  else
    next_attempt_count := outbox_row.attempt_count + 1;
    retry_minutes := least(60, (2 ^ next_attempt_count)::integer);

    update public.notification_outbox
    set
      status = case when next_attempt_count >= 5 then 'failed'::public.notification_outbox_status else 'pending'::public.notification_outbox_status end,
      attempt_count = next_attempt_count,
      processing_started_at = null,
      next_attempt_at = now() + make_interval(mins => retry_minutes),
      last_error = left(coalesce(target_error, 'Unknown notification error'), 500),
      updated_at = now()
    where id = target_outbox_id
    returning * into outbox_row;
  end if;

  return outbox_row;
end;
$$;

create or replace function public.get_organization_readiness(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_admin boolean;
  has_employee boolean;
  has_places boolean;
  has_timed_places boolean;
  has_products boolean;
  has_services boolean;
  has_shift_templates boolean;
  has_finance_categories boolean;
  has_share_rate boolean;
  telegram_configured boolean;
  migration_schema_readiness boolean;
  blocker_list text[] := array[]::text[];
  warning_list text[] := array[]::text[];
  required_ready integer := 0;
  required_total integer := 6;
  readiness integer;
begin
  if not (public.is_platform_owner() or public.is_organization_admin(target_organization_id)) then
    raise exception 'You do not have access to organization readiness.';
  end if;

  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_organization_id
      and role = 'organization_admin'
      and is_active = true
  ) into has_admin;

  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_organization_id
      and role = 'employee'
      and is_active = true
  ) into has_employee;

  select exists (select 1 from public.places where organization_id = target_organization_id and status = 'active') into has_places;
  select exists (select 1 from public.places where organization_id = target_organization_id and status = 'active' and has_timer = true) into has_timed_places;
  select exists (select 1 from public.products where organization_id = target_organization_id and status = 'active') into has_products;
  select exists (select 1 from public.services where organization_id = target_organization_id and status = 'active') into has_services;
  select exists (select 1 from public.shift_templates where organization_id = target_organization_id and is_active = true) into has_shift_templates;
  select exists (select 1 from public.finance_categories where organization_id = target_organization_id and is_active = true) into has_finance_categories;
  select public.get_current_platform_share_rate(target_organization_id, current_date) > 0 into has_share_rate;
  select exists (
    select 1 from public.organization_notification_settings
    where organization_id = target_organization_id
      and telegram_enabled = true
      and length(btrim(coalesce(telegram_chat_id, ''))) > 0
  ) into telegram_configured;

  migration_schema_readiness := to_regclass('public.finance_transactions') is not null
    and to_regclass('public.employee_shifts') is not null
    and to_regclass('public.notification_outbox') is not null
    and to_regclass('public.stock_movements') is not null;

  if has_admin then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'admin'); end if;
  if has_employee then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'employee'); end if;
  if has_places then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'places'); end if;
  if has_timed_places then required_ready := required_ready + 1; else warning_list := array_append(warning_list, 'timed_places'); end if;
  if has_shift_templates then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'shift_templates'); end if;
  if has_finance_categories then required_ready := required_ready + 1; else blocker_list := array_append(blocker_list, 'finance_categories'); end if;
  if not has_share_rate then warning_list := array_append(warning_list, 'Platform share rate təyin edilməyib'); end if;
  if not telegram_configured then warning_list := array_append(warning_list, 'telegram'); end if;
  if not has_products and not has_services then warning_list := array_append(warning_list, 'products_or_services'); end if;
  if not migration_schema_readiness then blocker_list := array_append(blocker_list, 'schema'); end if;

  readiness := floor((required_ready::numeric / required_total::numeric) * 100)::integer;

  return jsonb_build_object(
    'organization_id', target_organization_id,
    'has_admin', has_admin,
    'has_employee', has_employee,
    'has_places', has_places,
    'has_timed_places', has_timed_places,
    'has_products', has_products,
    'has_services', has_services,
    'has_shift_templates', has_shift_templates,
    'has_finance_categories', has_finance_categories,
    'has_share_rate', has_share_rate,
    'telegram_configured', telegram_configured,
    'migration_schema_readiness', migration_schema_readiness,
    'readiness_percentage', readiness,
    'blockers', blocker_list,
    'warnings', warning_list
  );
end;
$$;

create or replace function public.submit_financial_period(
  target_period_start date,
  target_period_end date
)
returns public.financial_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
  summary jsonb;
  period_row public.financial_periods;
begin
  target_organization_id := public.current_user_primary_organization_id();
  if target_organization_id is null then raise exception 'Organization was not found for current user.'; end if;
  if not public.is_organization_admin(target_organization_id) then raise exception 'Only organization admins can submit financial periods.'; end if;
  if target_period_end < target_period_start then raise exception 'Period end cannot be before period start.'; end if;

  select * into period_row
  from public.financial_periods
  where organization_id = target_organization_id
    and period_start = target_period_start
    and period_end = target_period_end
  for update;

  if period_row.status = 'locked' then
    raise exception 'Locked financial period cannot be resubmitted.';
  end if;

  if exists (
    select 1
    from public.finance_transactions ft
    where ft.organization_id = target_organization_id
      and ft.transaction_type = 'expense'
      and ft.expense_approval_status = 'pending'
      and ft.accrual_date between target_period_start and target_period_end
  ) then
    raise exception 'Financial period has pending expense approvals.';
  end if;

  summary := public.calculate_financial_period(target_organization_id, target_period_start, target_period_end);
  perform set_config('app.finance_write', '1', true);

  insert into public.financial_periods (
    organization_id,
    period_start,
    period_end,
    status,
    revenue,
    cogs,
    gross_profit,
    operating_expenses,
    other_income,
    net_profit_before_platform_share,
    platform_share_percentage,
    platform_share_amount,
    organization_owner_amount,
    cash_inflow,
    cash_outflow,
    submitted_by,
    submitted_at
  )
  values (
    target_organization_id,
    target_period_start,
    target_period_end,
    'submitted',
    (summary ->> 'revenue')::numeric,
    (summary ->> 'cogs')::numeric,
    (summary ->> 'gross_profit')::numeric,
    (summary ->> 'operating_expenses')::numeric,
    (summary ->> 'other_income')::numeric,
    (summary ->> 'net_profit_before_platform_share')::numeric,
    (summary ->> 'platform_share_percentage')::numeric,
    (summary ->> 'platform_share_amount')::numeric,
    (summary ->> 'organization_owner_amount')::numeric,
    (summary ->> 'cash_inflow')::numeric,
    (summary ->> 'cash_outflow')::numeric,
    auth.uid(),
    now()
  )
  on conflict (organization_id, period_start, period_end) do update
  set
    status = 'submitted',
    revenue = excluded.revenue,
    cogs = excluded.cogs,
    gross_profit = excluded.gross_profit,
    operating_expenses = excluded.operating_expenses,
    other_income = excluded.other_income,
    net_profit_before_platform_share = excluded.net_profit_before_platform_share,
    platform_share_percentage = excluded.platform_share_percentage,
    platform_share_amount = excluded.platform_share_amount,
    organization_owner_amount = excluded.organization_owner_amount,
    cash_inflow = excluded.cash_inflow,
    cash_outflow = excluded.cash_outflow,
    submitted_by = excluded.submitted_by,
    submitted_at = excluded.submitted_at,
    reviewed_by = null,
    reviewed_at = null,
    review_comment = null,
    updated_at = now()
  returning * into period_row;

  perform public.finance_log(target_organization_id, 'finance.period_submitted', 'financial_period', period_row.id, null, to_jsonb(period_row));
  perform public.create_notification_outbox(
    target_organization_id,
    'custom',
    'financial_period',
    period_row.id,
    jsonb_build_object('event', 'financial_period_submitted', 'period', to_jsonb(period_row)),
    'financial_period_submitted:' || period_row.id::text || ':' || extract(epoch from period_row.submitted_at)::text
  );

  return period_row;
end;
$$;

create or replace function public.mark_order_payment_refused(
  target_order_id uuid,
  target_comment text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
begin
  if length(btrim(coalesce(target_comment, ''))) = 0 then raise exception 'Payment refusal comment is required.'; end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if order_row.id is null then raise exception 'Order was not found.'; end if;
  if order_row.status not in ('open', 'waiting_payment') then raise exception 'Order cannot be refused in current status.'; end if;
  if not public.can_work_with_orders(order_row.organization_id) then raise exception 'You do not have access to this order.'; end if;
  if exists (select 1 from public.timed_sessions where order_id = order_row.id and status = 'active') then
    raise exception 'Active timed session must be completed first.';
  end if;

  perform set_config('app.order_write', '1', true);
  perform public.consume_order_stock(order_row.id);

  update public.orders
  set
    status = 'payment_refused',
    paid_amount = 0,
    unpaid_amount = total_amount,
    payment_refusal_comment = target_comment,
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = order_row.id
  returning * into order_row;

  perform public.log_audit(order_row.organization_id, 'payment.refused', 'order', order_row.id, jsonb_build_object('amount', order_row.total_amount, 'comment', target_comment));
  perform public.create_notification_outbox(
    order_row.organization_id,
    'payment_refused',
    'order',
    order_row.id,
    jsonb_build_object('order', to_jsonb(order_row), 'comment', target_comment),
    'payment_refused:' || order_row.id::text
  );

  return order_row;
end;
$$;

create or replace view public.employee_categories
with (security_invoker = true, security_barrier = true)
as
select id, organization_id, type, name, description, image_path, sort_order, status
from public.catalog_categories
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.employee_places
with (security_invoker = true, security_barrier = true)
as
select
  id,
  organization_id,
  category_id,
  name,
  type,
  custom_type_name,
  description,
  image_path,
  has_timer,
  hourly_rate,
  minimum_minutes,
  billing_step_minutes,
  capacity,
  sort_order,
  status
from public.places
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.employee_products
with (security_invoker = true, security_barrier = true)
as
select
  id,
  organization_id,
  category_id,
  sku,
  name,
  description,
  characteristics,
  image_path,
  sale_price,
  unit_name,
  sort_order,
  status
from public.products
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.employee_services
with (security_invoker = true, security_barrier = true)
as
select
  id,
  organization_id,
  category_id,
  name,
  description,
  characteristics,
  image_path,
  pricing_type,
  fixed_price,
  hourly_rate,
  minimum_minutes,
  billing_step_minutes,
  sort_order,
  status
from public.services
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.combo_availability
with (security_invoker = true, security_barrier = true)
as
with product_requirements as (
  select
    c.id as combo_id,
    c.organization_id,
    cc.product_id,
    sum(cc.quantity) as required_quantity
  from public.combos c
  join public.combo_components cc on cc.combo_id = c.id
  where cc.component_type = 'product'
    and cc.is_required = true
  group by c.id, c.organization_id, cc.product_id
),
component_availability as (
  select
    pr.combo_id,
    pr.organization_id,
    pr.product_id,
    pr.required_quantity,
    p.track_stock,
    p.status as product_status,
    public.calculate_available_product_stock(pr.product_id) as current_stock,
    case
      when p.track_stock = false then null
      else floor(public.calculate_available_product_stock(pr.product_id) / pr.required_quantity)
    end as available_quantity
  from product_requirements pr
  join public.products p on p.id = pr.product_id
)
select
  c.id as combo_id,
  c.organization_id,
  (
    c.status = 'active'
    and public.is_organization_member(c.organization_id)
    and not exists (
      select 1
      from component_availability ca
      where ca.combo_id = c.id
        and ca.track_stock = true
        and (ca.product_status <> 'active' or ca.current_stock < ca.required_quantity)
    )
  ) as is_available,
  case
    when not (public.is_platform_owner() or public.is_organization_admin(c.organization_id)) then null
    when not exists (select 1 from component_availability ca where ca.combo_id = c.id and ca.track_stock = true) then null
    else (
      select min(ca.available_quantity)::integer
      from component_availability ca
      where ca.combo_id = c.id
        and ca.track_stock = true
    )
  end as available_quantity,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', ca.product_id,
      'required_quantity', ca.required_quantity,
      'current_stock', case when public.is_platform_owner() or public.is_organization_admin(c.organization_id) then ca.current_stock else null end
    ))
    from component_availability ca
    where ca.combo_id = c.id
      and ca.track_stock = true
      and (ca.product_status <> 'active' or ca.current_stock < ca.required_quantity)
  ), '[]'::jsonb) as missing_components
from public.combos c
where public.is_platform_owner() or public.is_organization_member(c.organization_id);

create or replace view public.employee_combos
with (security_invoker = true, security_barrier = true)
as
select
  c.id,
  c.organization_id,
  c.category_id,
  c.name,
  c.description,
  c.image_path,
  c.sale_price,
  null::integer as available_quantity,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'type', cc.component_type,
      'name', coalesce(p.name, s.name),
      'quantity', cc.quantity,
      'included_minutes', cc.included_minutes
    ) order by cc.sort_order)
    from public.combo_components cc
    left join public.products p on p.id = cc.product_id
    left join public.services s on s.id = cc.service_id
    where cc.combo_id = c.id
  ), '[]'::jsonb) as component_preview
from public.combos c
join public.combo_availability ca on ca.combo_id = c.id
where c.status = 'active'
  and ca.is_available = true
  and public.is_organization_member(c.organization_id);

create or replace view public.employee_workspace_places
with (security_invoker = true, security_barrier = true)
as
select
  p.id,
  p.organization_id,
  p.category_id,
  p.name,
  p.type,
  p.custom_type_name,
  p.description,
  p.image_path,
  p.has_timer,
  p.hourly_rate,
  p.minimum_minutes,
  p.billing_step_minutes,
  p.capacity,
  p.sort_order,
  p.status,
  o.id as active_order_id,
  o.order_number as active_order_number,
  o.status as active_order_status,
  o.total_amount as active_order_total,
  ts.id as active_session_id,
  ts.started_at as active_session_started_at,
  ts.hourly_rate_snapshot as active_session_hourly_rate,
  ts.minimum_minutes_snapshot as active_session_minimum_minutes,
  ts.billing_step_minutes_snapshot as active_session_billing_step_minutes,
  coalesce((
    select count(*)
    from public.order_items oi
    where oi.order_id = o.id
      and oi.status = 'active'
  ), 0)::integer as active_order_item_count
from public.places p
left join public.orders o on o.place_id = p.id and o.status in ('open', 'waiting_payment')
left join public.timed_sessions ts on ts.place_id = p.id and ts.status = 'active'
where p.status = 'active'
  and public.is_organization_member(p.organization_id);

create or replace view public.employee_orders
with (security_invoker = true, security_barrier = true)
as
select
  o.id,
  o.organization_id,
  o.order_number,
  o.place_id,
  o.current_place_name_snapshot,
  o.status,
  o.customer_label,
  o.comment,
  o.subtotal,
  o.total_amount,
  o.paid_amount,
  o.unpaid_amount,
  o.opened_by,
  o.opened_at,
  o.closed_at,
  o.payment_refusal_comment,
  o.created_at,
  o.updated_at
from public.orders o
where public.is_organization_member(o.organization_id);

create or replace view public.employee_order_items
with (security_invoker = true, security_barrier = true)
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
  oi.updated_at
from public.order_items oi
where public.is_organization_member(oi.organization_id);

create or replace view public.employee_timed_sessions
with (security_invoker = true, security_barrier = true)
as
select
  ts.id,
  ts.organization_id,
  ts.order_id,
  ts.place_id,
  ts.service_id,
  ts.status,
  ts.place_name_snapshot,
  ts.service_name_snapshot,
  ts.hourly_rate_snapshot,
  ts.minimum_minutes_snapshot,
  ts.billing_step_minutes_snapshot,
  ts.started_at,
  ts.ended_at,
  ts.actual_minutes,
  ts.billable_minutes,
  ts.calculated_amount,
  ts.started_by,
  ts.ended_by,
  ts.created_at,
  ts.updated_at,
  ts.started_shift_id,
  ts.ended_shift_id
from public.timed_sessions ts
where public.is_organization_member(ts.organization_id);

create or replace view public.order_financial_summary
with (security_invoker = true, security_barrier = true)
as
select
  o.organization_id,
  o.id as order_id,
  o.order_number,
  p.id as payment_id,
  p.method as order_payment_method,
  public.finance_payment_method_from_order(p.method) as finance_payment_method,
  p.completed_at as paid_at,
  public.get_business_date(o.organization_id, coalesce(p.completed_at, o.closed_at, o.updated_at)) as business_date,
  o.total_amount::numeric(14,2) as revenue,
  public.calculate_order_cost(o.id)::numeric(14,2) as cogs,
  (o.total_amount - public.calculate_order_cost(o.id))::numeric(14,2) as gross_profit,
  o.closed_shift_id,
  es.operational_day_id
from public.orders o
join public.payments p on p.order_id = o.id and p.status = 'completed'
left join public.employee_shifts es on es.id = o.closed_shift_id
where o.status = 'paid'
  and (public.is_platform_owner() or public.is_organization_admin(o.organization_id));

create or replace view public.finance_dashboard_summary
with (security_invoker = true, security_barrier = true)
as
select
  o.id as organization_id,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'income' and ft.status in ('paid', 'partial')), 0)::numeric(14,2) as total_income,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'expense' and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_expenses,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'purchase' and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_purchases,
  coalesce((select sum(outstanding_amount) from public.platform_share_accruals psa where psa.organization_id = o.id and psa.status <> 'paid'), 0)::numeric(14,2) as platform_share_outstanding,
  coalesce((select count(*) from public.finance_transactions ft where ft.organization_id = o.id and ft.expense_approval_status = 'pending'), 0)::integer as pending_expense_approvals,
  coalesce((select count(*) from public.financial_periods fp where fp.organization_id = o.id and fp.status in ('submitted', 'clarification_requested')), 0)::integer as periods_waiting_review
from public.organizations o
where public.is_platform_owner() or public.is_organization_admin(o.id);

grant execute on function public.claim_notification_outbox(integer, integer) to authenticated;
grant execute on function public.finish_notification_outbox_item(uuid, boolean, text, boolean) to authenticated;
grant execute on function public.get_organization_readiness(uuid) to authenticated;
