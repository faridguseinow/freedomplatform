-- Store editable VIP cabinet equipment labels for the employee workspace.

create table if not exists public.place_vip_equipment (
  place_id uuid primary key references public.places(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  equipment_name text,
  equipment_time text,
  equipment_price text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint place_vip_equipment_text_check check (
    length(coalesce(equipment_name, '')) <= 120
    and length(coalesce(equipment_time, '')) <= 80
    and length(coalesce(equipment_price, '')) <= 80
  )
);

create index if not exists place_vip_equipment_organization_id_idx
on public.place_vip_equipment (organization_id);

alter table public.place_vip_equipment enable row level security;

drop policy if exists "VIP equipment readable by organization members" on public.place_vip_equipment;
create policy "VIP equipment readable by organization members"
on public.place_vip_equipment for select to authenticated
using (public.is_organization_member(organization_id));

drop function if exists public.update_place_vip_equipment(uuid, text, text, text);
drop view if exists public.employee_workspace_places;

create view public.employee_workspace_places
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
  o.opened_at as active_order_opened_at,
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
  p.workspace_h,
  pve.equipment_name as vip_equipment_name,
  pve.equipment_time as vip_equipment_time,
  pve.equipment_price as vip_equipment_price
from public.places p
left join public.orders o on o.place_id = p.id and o.status in ('open', 'waiting_payment')
left join public.timed_sessions ts on ts.place_id = p.id and ts.status = 'active'
left join public.place_vip_equipment pve on pve.place_id = p.id
where p.status = 'active'
  and public.is_organization_member(p.organization_id);

grant select on public.employee_workspace_places to authenticated;

create or replace function public.update_place_vip_equipment(
  target_place_id uuid,
  target_equipment_name text default null,
  target_equipment_time text default null,
  target_equipment_price text default null
)
returns public.employee_workspace_places
language plpgsql
security definer
set search_path = public
as $$
declare
  place_row public.places;
  workspace_row public.employee_workspace_places;
  normalized_name text;
  normalized_time text;
  normalized_price text;
begin
  select * into place_row
  from public.places
  where id = target_place_id
  for update;

  if place_row.id is null then raise exception 'Place was not found.'; end if;
  if place_row.status <> 'active' then raise exception 'Place is not active.'; end if;
  if not public.can_work_with_orders(place_row.organization_id) then raise exception 'You do not have access to this place.'; end if;
  if not (
    place_row.type in ('vip_room', 'private_room')
    or lower(place_row.name) like '%vip%'
  ) then
    raise exception 'VIP equipment can be edited only for VIP cabinets.';
  end if;

  normalized_name := nullif(btrim(coalesce(target_equipment_name, '')), '');
  normalized_time := nullif(btrim(coalesce(target_equipment_time, '')), '');
  normalized_price := nullif(btrim(coalesce(target_equipment_price, '')), '');

  if length(coalesce(normalized_name, '')) > 120
    or length(coalesce(normalized_time, '')) > 80
    or length(coalesce(normalized_price, '')) > 80
  then
    raise exception 'VIP equipment fields are too long.';
  end if;

  insert into public.place_vip_equipment (
    place_id,
    organization_id,
    equipment_name,
    equipment_time,
    equipment_price,
    updated_by,
    updated_at
  )
  values (
    place_row.id,
    place_row.organization_id,
    normalized_name,
    normalized_time,
    normalized_price,
    auth.uid(),
    now()
  )
  on conflict (place_id) do update
  set
    equipment_name = excluded.equipment_name,
    equipment_time = excluded.equipment_time,
    equipment_price = excluded.equipment_price,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  perform public.log_audit(
    place_row.organization_id,
    'place.vip_equipment_updated',
    'place',
    place_row.id,
    jsonb_build_object(
      'equipment_name', normalized_name,
      'equipment_time', normalized_time,
      'equipment_price', normalized_price
    )
  );

  select * into workspace_row
  from public.employee_workspace_places
  where id = place_row.id;

  return workspace_row;
end;
$$;
