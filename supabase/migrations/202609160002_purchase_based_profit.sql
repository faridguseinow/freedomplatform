-- Use a simple cash-style profit model for goods: the whole posted purchase is
-- deducted in the purchase period. The legacy `cogs` fields stay in place for
-- API compatibility, but now store the period's goods purchases.

create or replace function public.seed_standard_finance_categories(target_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org_row public.organizations;
  inserted_count integer := 0;
  category_specs jsonb := '[
    {"code":"order_income","type":"income","name":"Sifariş gəlirləri","profit":true,"cash":true,"deduct":false,"sort":10},
    {"code":"manual_income","type":"income","name":"Əl ilə daxil edilən gəlir","profit":true,"cash":true,"deduct":false,"sort":20},
    {"code":"purchase_goods","type":"expense","name":"Məhsul alışları (Bazarlıq)","profit":true,"cash":true,"deduct":false,"sort":30},
    {"code":"rent","type":"expense","name":"İcarə","profit":true,"cash":true,"deduct":true,"sort":40},
    {"code":"salary","type":"expense","name":"Əməkhaqqı","profit":true,"cash":true,"deduct":true,"sort":50},
    {"code":"utilities","type":"expense","name":"Kommunal xidmətlər","profit":true,"cash":true,"deduct":true,"sort":60},
    {"code":"marketing","type":"expense","name":"Marketinq","profit":true,"cash":true,"deduct":true,"sort":70},
    {"code":"platform_share","type":"platform_share_accrual","name":"Freedom Platform aylıq ödənişi","profit":false,"cash":false,"deduct":false,"sort":90},
    {"code":"platform_share_payment","type":"platform_share_payment","name":"Freedom Platform ödənişi","profit":false,"cash":true,"deduct":false,"sort":100}
  ]'::jsonb;
  spec jsonb;
begin
  for org_row in
    select * from public.organizations
    where target_organization_id is null or id = target_organization_id
  loop
    if not (public.is_platform_owner() or public.is_organization_admin(org_row.id)) then
      continue;
    end if;

    perform set_config('app.finance_write', '1', true);

    insert into public.organization_finance_settings (
      organization_id,
      reporting_currency_code
    )
    values (org_row.id, org_row.currency_code)
    on conflict (organization_id) do nothing;

    for spec in select * from jsonb_array_elements(category_specs)
    loop
      insert into public.finance_categories (
        organization_id,
        transaction_type,
        name,
        system_code,
        affects_profit,
        affects_cash_flow,
        eligible_for_platform_share_deduction,
        sort_order,
        is_system,
        created_by
      )
      values (
        org_row.id,
        (spec ->> 'type')::public.finance_transaction_type,
        spec ->> 'name',
        spec ->> 'code',
        (spec ->> 'profit')::boolean,
        (spec ->> 'cash')::boolean,
        (spec ->> 'deduct')::boolean,
        (spec ->> 'sort')::integer,
        true,
        auth.uid()
      )
      on conflict (organization_id, system_code) where system_code is not null do update
      set
        name = excluded.name,
        transaction_type = excluded.transaction_type,
        affects_profit = excluded.affects_profit,
        affects_cash_flow = excluded.affects_cash_flow,
        sort_order = excluded.sort_order,
        updated_at = now();

      inserted_count := inserted_count + 1;
    end loop;
  end loop;

  return inserted_count;
end;
$$;

select set_config('app.finance_write', '1', true);

update public.finance_categories
set
  name = 'Məhsul alışları (Bazarlıq)',
  affects_profit = true,
  affects_cash_flow = true,
  eligible_for_platform_share_deduction = false,
  updated_at = now()
where system_code = 'purchase_goods';

create or replace function public.create_purchase_finance_transaction(target_document_id uuid)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.stock_documents;
  category_id uuid;
  calculated_amount numeric(14,2);
  transaction_row public.finance_transactions;
  business_date date;
begin
  select * into document_row from public.stock_documents where id = target_document_id for update;
  if document_row.id is null then raise exception 'Stock document was not found.'; end if;
  if document_row.status <> 'posted' or document_row.type <> 'purchase' then return null; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(document_row.organization_id)) then
    raise exception 'Only organization admins can sync purchase finance transactions.';
  end if;

  perform public.seed_standard_finance_categories(document_row.organization_id);

  select id into category_id
  from public.finance_categories
  where organization_id = document_row.organization_id and system_code = 'purchase_goods'
  limit 1;

  select coalesce(document_row.total_amount, sum(coalesce(sdi.line_total, sdi.quantity * coalesce(sdi.unit_cost, 0))), 0)::numeric(14,2)
  into calculated_amount
  from public.stock_document_items sdi
  where sdi.document_id = document_row.id;

  if calculated_amount <= 0 then return null; end if;

  business_date := public.get_business_date(document_row.organization_id, coalesce(document_row.posted_at, document_row.document_date, now()));
  perform set_config('app.finance_write', '1', true);

  insert into public.finance_transactions (
    organization_id,
    transaction_type,
    category_id,
    source_type,
    source_id,
    title,
    amount,
    paid_amount,
    status,
    accrual_date,
    paid_date,
    recipient_or_supplier,
    reference,
    affects_profit,
    affects_cash_flow,
    eligible_for_platform_share_deduction,
    created_by
  )
  values (
    document_row.organization_id,
    'purchase',
    category_id,
    'stock_document',
    document_row.id,
    'Базарлык #' || document_row.document_number::text,
    calculated_amount,
    calculated_amount,
    'paid',
    business_date,
    business_date,
    document_row.supplier_name,
    document_row.reference,
    true,
    true,
    false,
    coalesce(document_row.posted_by, document_row.created_by)
  )
  on conflict (organization_id, source_type, source_id)
  where source_type = 'stock_document' and transaction_type = 'purchase' and source_id is not null
  do update set
    category_id = excluded.category_id,
    title = excluded.title,
    amount = excluded.amount,
    paid_amount = excluded.paid_amount,
    status = excluded.status,
    accrual_date = excluded.accrual_date,
    paid_date = excluded.paid_date,
    recipient_or_supplier = excluded.recipient_or_supplier,
    reference = excluded.reference,
    affects_profit = excluded.affects_profit,
    affects_cash_flow = excluded.affects_cash_flow,
    eligible_for_platform_share_deduction = excluded.eligible_for_platform_share_deduction,
    updated_at = now()
  returning * into transaction_row;

  perform public.finance_log(document_row.organization_id, 'finance.purchase_synced', 'finance_transaction', transaction_row.id, null, to_jsonb(transaction_row));
  return transaction_row;
end;
$$;

create or replace function public.calculate_financial_period(
  target_organization_id uuid,
  target_period_start date,
  target_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  revenue numeric(14,2);
  manual_income numeric(14,2);
  goods_purchases numeric(14,2);
  operating_expenses numeric(14,2);
  cash_inflow numeric(14,2);
  cash_outflow numeric(14,2);
  gross_profit numeric(14,2);
  net_profit numeric(14,2);
  fixed_platform_fee numeric(14,2);
begin
  if target_period_end < target_period_start then raise exception 'Period end cannot be before period start.'; end if;
  if not (public.is_platform_owner() or public.is_organization_admin(target_organization_id)) then
    raise exception 'You do not have access to this financial period.';
  end if;

  select coalesce(sum(ft.amount), 0)::numeric(14,2)
  into revenue
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.status in ('paid', 'partial')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ft.amount), 0)::numeric(14,2)
  into manual_income
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.source_type = 'manual'
    and ft.status in ('paid', 'partial')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ft.amount), 0)::numeric(14,2)
  into goods_purchases
  from public.finance_transactions ft
  left join public.finance_categories fc on fc.id = ft.category_id
  where ft.organization_id = target_organization_id
    and ft.accrual_date between target_period_start and target_period_end
    and ft.status <> 'cancelled'
    and (
      ft.transaction_type = 'purchase'
      or (
        ft.transaction_type = 'expense'
        and fc.system_code = 'purchase_goods'
        and ft.expense_approval_status not in ('pending', 'rejected')
      )
    );

  select coalesce(sum(ft.amount), 0)::numeric(14,2)
  into operating_expenses
  from public.finance_transactions ft
  left join public.finance_categories fc on fc.id = ft.category_id
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'expense'
    and ft.affects_profit = true
    and coalesce(fc.system_code, '') <> 'purchase_goods'
    and ft.status <> 'cancelled'
    and ft.expense_approval_status not in ('pending', 'rejected')
    and ft.accrual_date between target_period_start and target_period_end;

  select coalesce(sum(ft.paid_amount), 0)::numeric(14,2)
  into cash_inflow
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type = 'income'
    and ft.affects_cash_flow = true
    and ft.status in ('paid', 'partial')
    and ft.paid_date between target_period_start and target_period_end;

  select coalesce(sum(
    case when ft.transaction_type = 'purchase' then ft.amount else ft.paid_amount end
  ), 0)::numeric(14,2)
  into cash_outflow
  from public.finance_transactions ft
  where ft.organization_id = target_organization_id
    and ft.transaction_type in ('expense', 'purchase', 'platform_share_payment')
    and ft.affects_cash_flow = true
    and (
      (ft.transaction_type = 'purchase' and ft.status <> 'cancelled')
      or (ft.transaction_type <> 'purchase' and ft.status in ('paid', 'partial'))
    )
    and coalesce(ft.paid_date, ft.accrual_date) between target_period_start and target_period_end;

  gross_profit := revenue - goods_purchases;
  net_profit := gross_profit - operating_expenses;
  fixed_platform_fee := public.get_monthly_platform_fee(target_organization_id, target_period_end);

  return jsonb_build_object(
    'organization_id', target_organization_id,
    'period_start', target_period_start,
    'period_end', target_period_end,
    'revenue', revenue,
    'cogs', goods_purchases,
    'gross_profit', gross_profit,
    'operating_expenses', operating_expenses,
    'other_income', manual_income,
    'net_profit_before_platform_share', net_profit,
    'platform_share_percentage', 0,
    'platform_share_amount', fixed_platform_fee,
    'organization_owner_amount', net_profit - fixed_platform_fee,
    'cash_inflow', cash_inflow,
    'cash_outflow', cash_outflow
  );
end;
$$;

create or replace view public.finance_dashboard_summary
with (security_barrier = true)
as
select
  o.id as organization_id,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'income' and ft.status in ('paid', 'partial')), 0)::numeric(14,2) as total_income,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type in ('expense', 'purchase') and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_expenses,
  coalesce((select sum(amount) from public.finance_transactions ft where ft.organization_id = o.id and ft.transaction_type = 'purchase' and ft.status <> 'cancelled'), 0)::numeric(14,2) as total_purchases,
  coalesce((select sum(outstanding_amount) from public.platform_share_accruals psa where psa.organization_id = o.id and psa.status <> 'paid'), 0)::numeric(14,2) as platform_share_outstanding,
  coalesce((select count(*) from public.finance_transactions ft where ft.organization_id = o.id and ft.expense_approval_status = 'pending'), 0)::integer as pending_expense_approvals,
  coalesce((select count(*) from public.financial_periods fp where fp.organization_id = o.id and fp.status in ('submitted', 'clarification_requested')), 0)::integer as periods_waiting_review,
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
  coalesce((
    select sum(p.amount)
    from public.payments p
    join public.orders o2 on p.order_id = o2.id
    where p.organization_id = o.id and p.status = 'completed' and exists (
      select 1 from public.order_items oi where oi.order_id = o2.id and oi.item_type = 'product'
    ) and coalesce((select pl.type::text from public.places pl where pl.id = o2.place_id), '') not in ('playstation','billiard','table','vip_room')
  ), 0)::numeric(14,2) as goods_revenue,
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

-- Recalculate every existing period and return it for a fresh review. The
-- locked-period trigger is removed only inside this transactional migration;
-- if any statement fails, PostgreSQL rolls the trigger removal back as well.
drop trigger if exists financial_periods_locked_guard on public.financial_periods;

with period_values as (
  select
    fp.id,
    coalesce((
      select sum(ft.amount)
      from public.finance_transactions ft
      left join public.finance_categories fc on fc.id = ft.category_id
      where ft.organization_id = fp.organization_id
        and ft.accrual_date between fp.period_start and fp.period_end
        and ft.status <> 'cancelled'
        and (
          ft.transaction_type = 'purchase'
          or (
            ft.transaction_type = 'expense'
            and fc.system_code = 'purchase_goods'
            and ft.expense_approval_status not in ('pending', 'rejected')
          )
        )
    ), 0)::numeric(14,2) as goods_purchases,
    coalesce((
      select sum(ft.amount)
      from public.finance_transactions ft
      left join public.finance_categories fc on fc.id = ft.category_id
      where ft.organization_id = fp.organization_id
        and ft.transaction_type = 'expense'
        and ft.affects_profit = true
        and coalesce(fc.system_code, '') <> 'purchase_goods'
        and ft.status <> 'cancelled'
        and ft.expense_approval_status not in ('pending', 'rejected')
        and ft.accrual_date between fp.period_start and fp.period_end
    ), 0)::numeric(14,2) as operating_expenses,
    coalesce((
      select sum(case when ft.transaction_type = 'purchase' then ft.amount else ft.paid_amount end)
      from public.finance_transactions ft
      where ft.organization_id = fp.organization_id
        and ft.transaction_type in ('expense', 'purchase', 'platform_share_payment')
        and ft.affects_cash_flow = true
        and (
          (ft.transaction_type = 'purchase' and ft.status <> 'cancelled')
          or (ft.transaction_type <> 'purchase' and ft.status in ('paid', 'partial'))
        )
        and coalesce(ft.paid_date, ft.accrual_date) between fp.period_start and fp.period_end
    ), 0)::numeric(14,2) as cash_outflow
  from public.financial_periods fp
  where fp.status <> 'cancelled'
)
update public.financial_periods fp
set
  status = 'submitted'::public.financial_period_status,
  cogs = pv.goods_purchases,
  gross_profit = fp.revenue - pv.goods_purchases,
  operating_expenses = pv.operating_expenses,
  net_profit_before_platform_share = fp.revenue - pv.goods_purchases - pv.operating_expenses,
  organization_owner_amount = fp.revenue - pv.goods_purchases - pv.operating_expenses - fp.platform_share_amount,
  cash_outflow = pv.cash_outflow,
  submitted_at = now(),
  reviewed_by = null,
  reviewed_at = null,
  review_comment = null,
  locked_at = null,
  updated_at = now()
from period_values pv
where fp.id = pv.id;

create trigger financial_periods_locked_guard before update on public.financial_periods
for each row execute function public.prevent_locked_financial_period_update();

update public.platform_share_accruals psa
set
  net_profit_snapshot = fp.net_profit_before_platform_share,
  updated_at = now()
from public.financial_periods fp
where fp.id = psa.financial_period_id;
