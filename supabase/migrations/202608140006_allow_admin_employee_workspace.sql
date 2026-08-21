-- Let organization admins temporarily work from the employee workspace.

create or replace function public.get_current_employee_shift_for_organization(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
  day_row public.operational_days;
  template_row public.shift_templates;
begin
  if not (
    public.is_platform_owner()
    or public.is_organization_admin(target_organization_id)
    or public.can_work_with_orders(target_organization_id)
  ) then
    raise exception 'You do not have access to this organization workspace.';
  end if;

  shift_row := public.current_employee_open_shift(target_organization_id);
  if shift_row.id is null then
    return null;
  end if;

  select * into day_row from public.operational_days where id = shift_row.operational_day_id;
  if shift_row.shift_template_id is not null then
    select * into template_row from public.shift_templates where id = shift_row.shift_template_id;
  end if;

  return jsonb_build_object(
    'shift', to_jsonb(shift_row),
    'operational_day', to_jsonb(day_row),
    'template', to_jsonb(template_row),
    'summary', public.calculate_shift_summary(shift_row.id),
    'accepted_handovers', coalesce((
      select jsonb_agg(to_jsonb(sh))
      from public.shift_handovers sh
      where sh.to_shift_id = shift_row.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.open_employee_shift_for_organization(
  target_organization_id uuid,
  target_shift_template_id uuid default null,
  target_opening_cash_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_row public.organization_memberships;
  organization_row public.organizations;
  template_row public.shift_templates;
  day_row public.operational_days;
  shift_row public.employee_shifts;
  accepted_handover public.shift_handovers;
  business_date date;
  local_start timestamp;
  local_end timestamp;
begin
  if target_opening_cash_amount < 0 then raise exception 'Opening cash cannot be negative.'; end if;

  select om.* into membership_row
  from public.organization_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.profiles p on p.id = om.user_id
  where om.organization_id = target_organization_id
    and om.user_id = auth.uid()
    and om.role in ('employee', 'organization_admin')
    and om.is_active = true
    and o.status = 'active'
    and p.is_active = true
  order by case when om.role = 'employee' then 0 else 1 end, om.created_at asc
  limit 1;

  if membership_row.id is null and public.is_platform_owner() then
    select o.* into organization_row
    from public.organizations o
    where o.id = target_organization_id
      and o.status = 'active';

    if organization_row.id is null then raise exception 'Organization is not active.'; end if;
  else
    if membership_row.id is null then
      raise exception 'Active employee or admin membership is required to open shift.';
    end if;

    select * into organization_row
    from public.organizations
    where id = membership_row.organization_id
      and status = 'active';
    if organization_row.id is null then raise exception 'Organization is not active.'; end if;
  end if;

  if exists (
    select 1 from public.employee_shifts es
    where es.organization_id = organization_row.id
      and es.employee_user_id = auth.uid()
      and es.status in ('open', 'closing')
  ) then
    raise exception 'Employee already has an open shift.';
  end if;

  if target_shift_template_id is not null then
    select * into template_row
    from public.shift_templates
    where id = target_shift_template_id
      and organization_id = organization_row.id
      and is_active = true;
    if template_row.id is null then raise exception 'Shift template was not found or is inactive.'; end if;
  end if;

  business_date := public.get_business_date(organization_row.id, now());
  day_row := public.get_or_create_operational_day(organization_row.id, business_date);

  if template_row.id is not null then
    local_start := business_date::timestamp + template_row.start_time;
    local_end := business_date::timestamp + template_row.end_time;
    if template_row.crosses_midnight then
      local_end := local_end + interval '1 day';
    end if;
  end if;

  perform set_config('app.shift_write', '1', true);

  insert into public.employee_shifts (
    organization_id,
    operational_day_id,
    shift_template_id,
    employee_user_id,
    scheduled_start_at,
    scheduled_end_at,
    opening_cash_amount
  )
  values (
    organization_row.id,
    day_row.id,
    template_row.id,
    auth.uid(),
    case when template_row.id is null then null else local_start at time zone organization_row.timezone end,
    case when template_row.id is null then null else local_end at time zone organization_row.timezone end,
    target_opening_cash_amount
  )
  returning * into shift_row;

  update public.shift_handovers
  set
    to_shift_id = shift_row.id,
    status = 'accepted',
    accepted_by = auth.uid(),
    accepted_at = now()
  where id = (
    select sh.id
    from public.shift_handovers sh
    where sh.organization_id = shift_row.organization_id
      and sh.operational_day_id = shift_row.operational_day_id
      and sh.status = 'pending'
    order by sh.created_at desc, sh.id desc
    limit 1
  )
  returning * into accepted_handover;

  perform public.log_audit(
    shift_row.organization_id,
    'shift.opened',
    'employee_shift',
    shift_row.id,
    jsonb_build_object('opening_cash_amount', target_opening_cash_amount, 'opened_from_role', coalesce(membership_row.role::text, 'platform_owner'))
  );
  perform public.create_notification_outbox(
    shift_row.organization_id,
    'shift_opened',
    'employee_shift',
    shift_row.id,
    jsonb_build_object('shift', to_jsonb(shift_row), 'template', to_jsonb(template_row)),
    'shift_opened:' || shift_row.id::text
  );

  return jsonb_build_object(
    'shift', to_jsonb(shift_row),
    'operational_day', to_jsonb(day_row),
    'template', to_jsonb(template_row),
    'accepted_handover', to_jsonb(accepted_handover)
  );
end;
$$;

create or replace function public.close_employee_shift_for_organization(
  target_organization_id uuid,
  target_actual_cash_amount numeric,
  target_comment text default null,
  target_handover_cash_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
  summary jsonb;
  expected_cash numeric(14,2);
  variance numeric(14,2);
  variance_status public.cash_variance_status;
  open_orders_count integer;
  active_sessions_count integer;
  handover_row public.shift_handovers;
begin
  if target_actual_cash_amount < 0 then raise exception 'Actual cash cannot be negative.'; end if;

  select * into shift_row
  from public.employee_shifts
  where organization_id = target_organization_id
    and employee_user_id = auth.uid()
    and status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if shift_row.id is null then raise exception 'Open shift was not found.'; end if;

  summary := public.calculate_shift_summary(shift_row.id);
  expected_cash := (summary ->> 'expected_cash_amount')::numeric;
  variance := target_actual_cash_amount - expected_cash;
  variance_status := case
    when variance = 0 then 'balanced'::public.cash_variance_status
    when variance < 0 then 'shortage'::public.cash_variance_status
    else 'overage'::public.cash_variance_status
  end;

  if variance <> 0 and length(btrim(coalesce(target_comment, ''))) = 0 then
    raise exception 'Comment is required when cash variance is not zero.';
  end if;

  select count(*) into open_orders_count
  from public.orders
  where organization_id = shift_row.organization_id
    and status in ('open', 'waiting_payment');

  select count(*) into active_sessions_count
  from public.timed_sessions
  where organization_id = shift_row.organization_id
    and status = 'active';

  perform set_config('app.shift_write', '1', true);

  update public.employee_shifts
  set
    status = 'closed',
    closed_at = now(),
    expected_cash_amount = expected_cash,
    actual_cash_amount = target_actual_cash_amount,
    cash_variance = variance,
    cash_variance_status = variance_status,
    cash_variance_comment = case when variance <> 0 then target_comment else null end,
    cash_sales_total = (summary ->> 'cash_sales_total')::numeric,
    card_transfer_sales_total = (summary ->> 'card_transfer_sales_total')::numeric,
    paid_orders_total = (summary ->> 'paid_orders_total')::numeric,
    unpaid_orders_total = (summary ->> 'unpaid_orders_total')::numeric,
    payment_refused_total = (summary ->> 'payment_refused_total')::numeric,
    completed_orders_count = (summary ->> 'completed_orders_count')::integer,
    payment_refused_count = (summary ->> 'payment_refused_count')::integer,
    opened_orders_count = (summary ->> 'opened_orders_count')::integer,
    transferred_orders_count = open_orders_count,
    closing_comment = target_comment,
    updated_at = now()
  where id = shift_row.id
  returning * into shift_row;

  if open_orders_count > 0 or active_sessions_count > 0 then
    insert into public.shift_handovers (
      organization_id,
      operational_day_id,
      from_shift_id,
      opening_orders_count,
      active_sessions_count,
      expected_cash_handover,
      actual_cash_handover,
      comment,
      created_by
    )
    values (
      shift_row.organization_id,
      shift_row.operational_day_id,
      shift_row.id,
      open_orders_count,
      active_sessions_count,
      expected_cash,
      target_handover_cash_amount,
      target_comment,
      auth.uid()
    )
    returning * into handover_row;

    insert into public.shift_handover_orders (
      organization_id,
      handover_id,
      order_id,
      active_session_id,
      order_total_snapshot,
      place_name_snapshot
    )
    select
      shift_row.organization_id,
      handover_row.id,
      o.id,
      ts.id,
      o.total_amount,
      o.current_place_name_snapshot
    from public.orders o
    left join public.timed_sessions ts on ts.order_id = o.id and ts.status = 'active'
    where o.organization_id = shift_row.organization_id
      and o.status in ('open', 'waiting_payment');

    perform public.log_audit(shift_row.organization_id, 'shift.handover_created', 'shift_handover', handover_row.id, to_jsonb(handover_row));
  end if;

  summary := public.calculate_shift_summary(shift_row.id);

  perform public.log_audit(shift_row.organization_id, 'shift.closed', 'employee_shift', shift_row.id, summary);
  perform public.create_notification_outbox(
    shift_row.organization_id,
    'shift_closed',
    'employee_shift',
    shift_row.id,
    jsonb_build_object('shift', to_jsonb(shift_row), 'summary', summary, 'handover', to_jsonb(handover_row)),
    'shift_closed:' || shift_row.id::text
  );

  if variance_status = 'shortage' then
    perform public.create_notification_outbox(
      shift_row.organization_id,
      'cash_shortage',
      'employee_shift',
      shift_row.id,
      jsonb_build_object('shift', to_jsonb(shift_row), 'summary', summary),
      'cash_shortage:' || shift_row.id::text
    );
    perform public.log_audit(shift_row.organization_id, 'shift.cash_shortage', 'employee_shift', shift_row.id, summary);
  elsif variance_status = 'overage' then
    perform public.create_notification_outbox(
      shift_row.organization_id,
      'cash_overage',
      'employee_shift',
      shift_row.id,
      jsonb_build_object('shift', to_jsonb(shift_row), 'summary', summary),
      'cash_overage:' || shift_row.id::text
    );
    perform public.log_audit(shift_row.organization_id, 'shift.cash_overage', 'employee_shift', shift_row.id, summary);
  end if;

  perform public.recalculate_operational_day(shift_row.operational_day_id);

  return jsonb_build_object(
    'shift', to_jsonb(shift_row),
    'summary', summary,
    'handover', to_jsonb(handover_row)
  );
end;
$$;

grant execute on function public.get_current_employee_shift_for_organization(uuid) to authenticated;
grant execute on function public.open_employee_shift_for_organization(uuid, uuid, numeric) to authenticated;
grant execute on function public.close_employee_shift_for_organization(uuid, numeric, text, numeric) to authenticated;
