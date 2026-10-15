-- Permit only demo actor references to change on protected finance history.

create or replace function public.prevent_locked_finance_transaction_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and current_setting('app.demo_user_consolidation', true) = '1'
    and auth.role() = 'service_role'
    and (to_jsonb(new) - 'created_by' - 'cancelled_by' - 'approval_requested_by' - 'approved_by' - 'updated_at') =
        (to_jsonb(old) - 'created_by' - 'cancelled_by' - 'approval_requested_by' - 'approved_by' - 'updated_at')
    and exists (
      select 1 from public.organizations o
      where o.id = old.organization_id and o.slug = 'demo'
    )
  then
    return new;
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1
    from public.financial_periods fp
    where fp.organization_id = old.organization_id
      and fp.status = 'locked'
      and old.accrual_date between fp.period_start and fp.period_end
  ) then
    raise exception 'Transactions in locked financial periods cannot be edited.';
  end if;

  return new;
end;
$$;

create or replace function public.assert_finance_transaction_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  category_row public.finance_categories;
begin
  if tg_op = 'UPDATE'
    and current_setting('app.demo_user_consolidation', true) = '1'
    and auth.role() = 'service_role'
    and (to_jsonb(new) - 'created_by' - 'cancelled_by' - 'approval_requested_by' - 'approved_by' - 'updated_at') =
        (to_jsonb(old) - 'created_by' - 'cancelled_by' - 'approval_requested_by' - 'approved_by' - 'updated_at')
    and exists (
      select 1 from public.organizations o
      where o.id = old.organization_id and o.slug = 'demo'
    )
  then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.source_type is distinct from old.source_type
      or new.source_id is distinct from old.source_id
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Cannot update protected finance transaction fields.';
    end if;
  end if;

  if new.category_id is not null then
    select * into category_row from public.finance_categories where id = new.category_id;
    if category_row.id is null or category_row.organization_id <> new.organization_id then
      raise exception 'Finance category does not belong to this organization.';
    end if;

    if new.transaction_type <> category_row.transaction_type
      and not (new.transaction_type = 'purchase' and category_row.transaction_type = 'expense')
    then
      raise exception 'Finance category type does not match transaction type.';
    end if;
  end if;

  if new.source_type = 'order' and new.source_id is not null and not exists (
    select 1 from public.orders o where o.id = new.source_id and o.organization_id = new.organization_id
  ) then
    raise exception 'Order source does not belong to this organization.';
  end if;

  if new.source_type = 'stock_document' and new.source_id is not null and not exists (
    select 1 from public.stock_documents sd where sd.id = new.source_id and sd.organization_id = new.organization_id
  ) then
    raise exception 'Stock document source does not belong to this organization.';
  end if;

  return new;
end;
$$;
