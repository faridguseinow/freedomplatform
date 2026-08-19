-- Migration: Add place-separated revenue fields to finance_dashboard_summary
-- Date: 2026-08-19

create or replace view public.finance_dashboard_summary
with (security_barrier = true)
as
select
  o.id as organization_id,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'income' and ft.status in ('paid', 'partial')), 0)::numeric(14,2) as total_income,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'expense' and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_expenses,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'purchase' and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_purchases,
  coalesce((select sum(outstanding_amount) from public.platform_share_accruals psa where psa.organization_id = o.id and psa.status <> 'paid'), 0)::numeric(14,2) as platform_share_outstanding,
  coalesce((select count(*) from public.finance_transactions ft where ft.organization_id = o.id and ft.expense_approval_status = 'pending'), 0)::integer as pending_expense_approvals,
  coalesce((select count(*) from public.financial_periods fp where fp.organization_id = o.id and fp.status in ('submitted', 'clarification_requested')), 0)::integer as periods_waiting_review,

  -- Revenue by place type: playstation, billiard, tables
  coalesce((
    select sum(p.amount)
    from public.payments p
    join public.orders o2 on p.order_id = o2.id
    join public.places pl on o2.place_id = pl.id
    where p.organization_id = o.id and p.status = 'completed' and pl.type = 'playstation'
  ), 0)::numeric(14,2) as playstation_revenue,

  coalesce((
    select sum(p.amount)
    from public.payments p
    join public.orders o2 on p.order_id = o2.id
    join public.places pl on o2.place_id = pl.id
    where p.organization_id = o.id and p.status = 'completed' and pl.type = 'billiard'
  ), 0)::numeric(14,2) as billiard_revenue,

  coalesce((
    select sum(p.amount)
    from public.payments p
    join public.orders o2 on p.order_id = o2.id
    join public.places pl on o2.place_id = pl.id
    where p.organization_id = o.id and p.status = 'completed' and pl.type in ('table', 'vip_room')
  ), 0)::numeric(14,2) as table_revenue,

  -- Goods: payments for orders that include product items and are not already counted above
  coalesce((
    select sum(p.amount)
    from public.payments p
    join public.orders o2 on p.order_id = o2.id
    where p.organization_id = o.id and p.status = 'completed' and exists (
      select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product'
    ) and coalesce((select pl.type::text from public.places pl where pl.id = o2.place_id), '') not in ('playstation','billiard','table','vip_room')
  ), 0)::numeric(14,2) as goods_revenue,

  -- Other revenue: remainder not classified above
  coalesce((
    select sum(p.amount)
    from public.payments p
    join public.orders o2 on p.order_id = o2.id
    left join public.places pl on o2.place_id = pl.id
    where p.organization_id = o.id and p.status = 'completed' and (
      (pl.id is null and not exists (select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product'))
      or (coalesce(pl.type::text, '') not in ('playstation','billiard','table','vip_room') and not exists (select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product'))
    )
  ), 0)::numeric(14,2) as other_revenue

from public.organizations o
where public.is_platform_owner() or public.is_organization_admin(o.id);

grant select on public.finance_dashboard_summary to authenticated;
