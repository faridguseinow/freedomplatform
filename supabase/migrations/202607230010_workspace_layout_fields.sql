alter table public.places
  add column if not exists workspace_x integer,
  add column if not exists workspace_y integer,
  add column if not exists workspace_w integer,
  add column if not exists workspace_h integer;

alter table public.places
  drop constraint if exists places_workspace_x_check,
  add constraint places_workspace_x_check check (workspace_x is null or workspace_x between 1 and 12);

alter table public.places
  drop constraint if exists places_workspace_y_check,
  add constraint places_workspace_y_check check (workspace_y is null or workspace_y > 0);

alter table public.places
  drop constraint if exists places_workspace_w_check,
  add constraint places_workspace_w_check check (workspace_w is null or workspace_w between 1 and 12);

alter table public.places
  drop constraint if exists places_workspace_h_check,
  add constraint places_workspace_h_check check (workspace_h is null or workspace_h > 0);

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
  status,
  workspace_x,
  workspace_y,
  workspace_w,
  workspace_h
from public.places
where status = 'active'
  and public.is_organization_member(organization_id);

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

grant select on public.employee_places to authenticated;
grant select on public.employee_workspace_places to authenticated;
