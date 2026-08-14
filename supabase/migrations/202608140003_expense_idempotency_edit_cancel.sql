-- Make manual expense creation idempotent and allow admins to edit/cancel manual expenses through RPC.

create unique index if not exists finance_transactions_manual_expense_source_unique_idx
on public.finance_transactions (organization_id, source_id)
where transaction_type = 'expense'
  and source_type = 'manual'
  and source_id is not null;

create or replace function public.create_expense(
  target_organization_id uuid,
  target_title text,
  target_amount numeric,
  target_category_id uuid,
  target_payment_method public.finance_payment_method default null,
  target_accrual_date date default current_date,
  target_paid_date date default null,
  target_recipient_or_supplier text default null,
  target_description text default null,
  target_document_path text default null,
  target_source_type public.finance_source_type default 'manual',
  target_source_id uuid default null
)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.organization_finance_settings;
  category_row public.finance_categories;
  approval_status public.expense_approval_status := 'not_required';
  transaction_status public.finance_transaction_status;
  paid_value numeric(14,2) := 0;
  transaction_row public.finance_transactions;
begin
  if not public.is_organization_admin(target_organization_id) then raise exception 'Only organization admins can create expenses.'; end if;
  if target_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;

  if target_source_type = 'manual' and target_source_id is not null then
    select * into transaction_row
    from public.finance_transactions
    where organization_id = target_organization_id
      and transaction_type = 'expense'
      and source_type = 'manual'
      and source_id = target_source_id;

    if transaction_row.id is not null then
      return transaction_row;
    end if;
  end if;

  perform public.seed_standard_finance_categories(target_organization_id);

  select * into category_row from public.finance_categories where id = target_category_id;
  if category_row.id is null or category_row.organization_id <> target_organization_id or category_row.transaction_type <> 'expense' then
    raise exception 'Expense category is invalid.';
  end if;

  select * into settings_row from public.organization_finance_settings where organization_id = target_organization_id;
  if settings_row.require_large_expense_approval
    and settings_row.large_expense_threshold is not null
    and target_amount >= settings_row.large_expense_threshold
  then
    approval_status := 'pending';
  end if;

  if approval_status = 'pending' then
    transaction_status := 'pending';
  elsif target_paid_date is null then
    transaction_status := 'pending';
  else
    transaction_status := 'paid';
    paid_value := target_amount;
  end if;

  perform set_config('app.finance_write', '1', true);

  begin
    insert into public.finance_transactions (
      organization_id,
      transaction_type,
      category_id,
      source_type,
      source_id,
      title,
      description,
      amount,
      paid_amount,
      status,
      payment_method,
      accrual_date,
      paid_date,
      recipient_or_supplier,
      document_path,
      affects_profit,
      affects_cash_flow,
      eligible_for_platform_share_deduction,
      expense_approval_status,
      approval_requested_by,
      created_by
    )
    values (
      target_organization_id,
      'expense',
      target_category_id,
      target_source_type,
      target_source_id,
      target_title,
      target_description,
      target_amount,
      paid_value,
      transaction_status,
      target_payment_method,
      target_accrual_date,
      target_paid_date,
      target_recipient_or_supplier,
      target_document_path,
      category_row.affects_profit,
      category_row.affects_cash_flow,
      category_row.eligible_for_platform_share_deduction,
      approval_status,
      case when approval_status = 'pending' then auth.uid() else null end,
      auth.uid()
    )
    returning * into transaction_row;
  exception
    when unique_violation then
      if target_source_type = 'manual' and target_source_id is not null then
        select * into transaction_row
        from public.finance_transactions
        where organization_id = target_organization_id
          and transaction_type = 'expense'
          and source_type = 'manual'
          and source_id = target_source_id;

        if transaction_row.id is not null then
          return transaction_row;
        end if;
      end if;
      raise;
  end;

  perform public.finance_log(target_organization_id, 'finance.expense_created', 'finance_transaction', transaction_row.id, null, to_jsonb(transaction_row));
  return transaction_row;
end;
$$;

create or replace function public.update_expense(
  target_transaction_id uuid,
  target_title text,
  target_amount numeric,
  target_category_id uuid,
  target_payment_method public.finance_payment_method default null,
  target_accrual_date date default current_date,
  target_paid_date date default null,
  target_recipient_or_supplier text default null,
  target_description text default null
)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.finance_transactions;
  transaction_row public.finance_transactions;
  settings_row public.organization_finance_settings;
  category_row public.finance_categories;
  approval_status public.expense_approval_status := 'not_required';
  transaction_status public.finance_transaction_status;
  paid_value numeric(14,2) := 0;
begin
  select * into old_row from public.finance_transactions where id = target_transaction_id for update;
  if old_row.id is null then raise exception 'Expense was not found.'; end if;
  if not public.is_organization_admin(old_row.organization_id) then raise exception 'Only organization admins can edit expenses.'; end if;
  if old_row.transaction_type <> 'expense' or old_row.source_type <> 'manual' then raise exception 'Only manual expenses can be edited.'; end if;
  if old_row.status = 'cancelled' then raise exception 'Cancelled expenses cannot be edited.'; end if;
  if target_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;

  select * into category_row from public.finance_categories where id = target_category_id;
  if category_row.id is null or category_row.organization_id <> old_row.organization_id or category_row.transaction_type <> 'expense' then
    raise exception 'Expense category is invalid.';
  end if;

  select * into settings_row from public.organization_finance_settings where organization_id = old_row.organization_id;
  if settings_row.require_large_expense_approval
    and settings_row.large_expense_threshold is not null
    and target_amount >= settings_row.large_expense_threshold
  then
    approval_status := 'pending';
  end if;

  if approval_status = 'pending' then
    transaction_status := 'pending';
  elsif target_paid_date is null then
    transaction_status := 'pending';
  else
    transaction_status := 'paid';
    paid_value := target_amount;
  end if;

  perform set_config('app.finance_write', '1', true);

  update public.finance_transactions
  set
    category_id = target_category_id,
    title = target_title,
    description = target_description,
    amount = target_amount,
    paid_amount = paid_value,
    status = transaction_status,
    payment_method = target_payment_method,
    accrual_date = target_accrual_date,
    paid_date = target_paid_date,
    recipient_or_supplier = target_recipient_or_supplier,
    affects_profit = category_row.affects_profit,
    affects_cash_flow = category_row.affects_cash_flow,
    eligible_for_platform_share_deduction = category_row.eligible_for_platform_share_deduction,
    expense_approval_status = approval_status,
    approval_requested_by = case when approval_status = 'pending' then auth.uid() else null end,
    approved_by = null,
    approved_at = null,
    updated_at = now()
  where id = old_row.id
  returning * into transaction_row;

  perform public.finance_log(old_row.organization_id, 'finance.expense_updated', 'finance_transaction', transaction_row.id, to_jsonb(old_row), to_jsonb(transaction_row));
  return transaction_row;
end;
$$;

create or replace function public.cancel_expense(
  target_transaction_id uuid,
  target_reason text
)
returns public.finance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.finance_transactions;
  transaction_row public.finance_transactions;
begin
  if length(btrim(coalesce(target_reason, ''))) = 0 then raise exception 'Cancellation reason is required.'; end if;

  select * into old_row from public.finance_transactions where id = target_transaction_id for update;
  if old_row.id is null then raise exception 'Expense was not found.'; end if;
  if not public.is_organization_admin(old_row.organization_id) then raise exception 'Only organization admins can cancel expenses.'; end if;
  if old_row.transaction_type <> 'expense' or old_row.source_type <> 'manual' then raise exception 'Only manual expenses can be cancelled.'; end if;
  if old_row.status = 'cancelled' then raise exception 'Expense is already cancelled.'; end if;

  perform set_config('app.finance_write', '1', true);

  update public.finance_transactions
  set
    status = 'cancelled',
    paid_amount = 0,
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    cancellation_reason = target_reason,
    updated_at = now()
  where id = old_row.id
  returning * into transaction_row;

  perform public.finance_log(old_row.organization_id, 'finance.expense_cancelled', 'finance_transaction', transaction_row.id, to_jsonb(old_row), to_jsonb(transaction_row), target_reason);
  return transaction_row;
end;
$$;

grant execute on function public.update_expense(uuid, text, numeric, uuid, public.finance_payment_method, date, date, text, text) to authenticated;
grant execute on function public.cancel_expense(uuid, text) to authenticated;
