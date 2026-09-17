-- Keep standard finance category names in Azerbaijani for existing and future organizations.

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
  name = case
    when system_code = 'order_income' or name = 'Доход от заказов' then 'Sifariş gəlirləri'
    when system_code = 'manual_income' or name = 'Ручной доход' then 'Əl ilə daxil edilən gəlir'
    when system_code = 'purchase_goods' or name in ('Закупка товаров', 'Закупка товаров (базарлык)') then 'Məhsul alışları (Bazarlıq)'
    when system_code = 'rent' or name = 'Аренда' then 'İcarə'
    when system_code = 'salary' or name = 'Зарплата' then 'Əməkhaqqı'
    when system_code = 'utilities' or name = 'Коммунальные расходы' then 'Kommunal xidmətlər'
    when system_code = 'marketing' or name = 'Маркетинг' then 'Marketinq'
    when system_code = 'platform_share' or name in ('Доля Freedom Platform', 'Ежемесячная оплата Freedom Platform') then 'Freedom Platform aylıq ödənişi'
    when system_code = 'platform_share_payment' or name in ('Оплата доли Freedom Platform', 'Оплата Freedom Platform') then 'Freedom Platform ödənişi'
    else name
  end,
  updated_at = now()
where system_code in (
  'order_income',
  'manual_income',
  'purchase_goods',
  'rent',
  'salary',
  'utilities',
  'marketing',
  'platform_share',
  'platform_share_payment'
)
or name in (
  'Доход от заказов',
  'Ручной доход',
  'Закупка товаров',
  'Закупка товаров (базарлык)',
  'Аренда',
  'Зарплата',
  'Коммунальные расходы',
  'Маркетинг',
  'Доля Freedom Platform',
  'Ежемесячная оплата Freedom Platform',
  'Оплата доли Freedom Platform',
  'Оплата Freedom Platform'
);
