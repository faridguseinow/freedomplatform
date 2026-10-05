-- One-off correction: a The Liga shift opened on 2026-10-04 was attached to
-- the 2026-10-03 operational day. Move that shift and its income to 2026-10-04.

do $$
declare
  target_organization_id uuid;
  target_shift_id uuid;
  old_operational_day_id uuid;
  new_operational_day_id uuid;
  target_shift_opened_at timestamptz;
  matched_shifts integer;
begin
  select o.id
  into target_organization_id
  from public.organizations o
  where o.slug = 'theliga';

  if target_organization_id is null then
    raise exception 'The Liga organization was not found.';
  end if;

  select count(*)::integer
  into matched_shifts
  from public.employee_shifts es
  join public.operational_days od on od.id = es.operational_day_id
  join public.organizations o on o.id = es.organization_id
  where es.organization_id = target_organization_id
    and od.business_date = date '2026-10-03'
    and (es.opened_at at time zone o.timezone)::date = date '2026-10-04'
    and es.cash_sales_total = 200.20
    and es.card_transfer_sales_total = 45.00
    and es.paid_orders_total = 245.20;

  if matched_shifts <> 1 then
    raise exception 'Expected exactly one misplaced shift, found %.', matched_shifts;
  end if;

  select es.id, es.operational_day_id, es.opened_at
  into target_shift_id, old_operational_day_id, target_shift_opened_at
  from public.employee_shifts es
  join public.operational_days od on od.id = es.operational_day_id
  join public.organizations o on o.id = es.organization_id
  where es.organization_id = target_organization_id
    and od.business_date = date '2026-10-03'
    and (es.opened_at at time zone o.timezone)::date = date '2026-10-04'
    and es.cash_sales_total = 200.20
    and es.card_transfer_sales_total = 45.00
    and es.paid_orders_total = 245.20;

  insert into public.operational_days (
    organization_id,
    business_date,
    opened_at
  )
  values (
    target_organization_id,
    date '2026-10-04',
    target_shift_opened_at
  )
  on conflict (organization_id, business_date)
  do update set updated_at = public.operational_days.updated_at
  returning id into new_operational_day_id;

  perform set_config('app.shift_write', '1', true);
  update public.employee_shifts
  set
    operational_day_id = new_operational_day_id,
    updated_at = now()
  where id = target_shift_id;

  update public.shift_handovers
  set operational_day_id = new_operational_day_id
  where from_shift_id = target_shift_id;

  perform set_config('app.finance_write', '1', true);
  update public.finance_transactions ft
  set
    accrual_date = date '2026-10-04',
    paid_date = date '2026-10-04',
    updated_at = now()
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.source_type = 'order'
    and ft.source_id in (
      select distinct p.order_id
      from public.payments p
      where p.shift_id = target_shift_id
        and p.status = 'completed'
    );

  perform public.recalculate_operational_day(old_operational_day_id);
  perform public.recalculate_operational_day(new_operational_day_id);
end
$$;
