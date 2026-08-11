-- Employee-facing views expose safe columns and enforce membership in the view predicates.
-- They must not run with invoker RLS, because the base catalog/inventory tables are admin-only.

create or replace view public.employee_categories
with (security_invoker = false, security_barrier = true)
as
select id, organization_id, type, name, description, image_path, sort_order, status
from public.catalog_categories
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.employee_places
with (security_invoker = false, security_barrier = true)
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
  status,
  workspace_x,
  workspace_y,
  workspace_w,
  workspace_h
from public.places
where status = 'active'
  and public.is_organization_member(organization_id);

create or replace view public.employee_products
with (security_invoker = false, security_barrier = true)
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
with (security_invoker = false, security_barrier = true)
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
with (security_invoker = false, security_barrier = true)
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
with (security_invoker = false, security_barrier = true)
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
with (security_invoker = false, security_barrier = true)
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
  ), 0)::integer as active_order_item_count,
  p.workspace_x,
  p.workspace_y,
  p.workspace_w,
  p.workspace_h
from public.places p
left join public.orders o on o.place_id = p.id and o.status in ('open', 'waiting_payment')
left join public.timed_sessions ts on ts.place_id = p.id and ts.status = 'active'
where p.status = 'active'
  and public.is_organization_member(p.organization_id);

create or replace view public.employee_orders
with (security_invoker = false, security_barrier = true)
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
  oi.updated_at
from public.order_items oi
where public.is_organization_member(oi.organization_id);

create or replace view public.employee_timed_sessions
with (security_invoker = false, security_barrier = true)
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

grant select on public.employee_categories to authenticated;
grant select on public.employee_places to authenticated;
grant select on public.employee_products to authenticated;
grant select on public.employee_services to authenticated;
grant select on public.combo_availability to authenticated;
grant select on public.employee_combos to authenticated;
grant select on public.employee_workspace_places to authenticated;
grant select on public.employee_orders to authenticated;
grant select on public.employee_order_items to authenticated;
grant select on public.employee_timed_sessions to authenticated;
