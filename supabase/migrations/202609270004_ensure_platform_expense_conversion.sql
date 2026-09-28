create or replace function public.convert_expense_to_platform_period_payment(
  target_transaction_id uuid,
  target_period_start date,
  target_period_end date
)
returns public.platform_share_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_row public.finance_transactions;
  payment_row public.platform_share_payments;
begin
  select * into expense_row
  from public.finance_transactions
  where id = target_transaction_id
  for update;

  if expense_row.id is null then
    raise exception 'Expense was not found.';
  end if;
  if not public.is_organization_admin(expense_row.organization_id) then
    raise exception 'Only organization admins can convert expenses.';
  end if;
  if expense_row.transaction_type <> 'expense'
    or expense_row.source_type <> 'manual'
    or expense_row.status = 'cancelled'
  then
    raise exception 'Only active manual expenses can be converted.';
  end if;

  select * into payment_row
  from public.report_platform_period_payment(
    expense_row.organization_id,
    target_period_start,
    target_period_end,
    expense_row.amount,
    coalesce(expense_row.payment_method, 'cash'::public.finance_payment_method),
    coalesce(expense_row.paid_date, expense_row.accrual_date),
    expense_row.title,
    expense_row.description
  );

  perform set_config('app.finance_write', '1', true);
  update public.finance_transactions
  set
    status = 'cancelled',
    paid_amount = 0,
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    cancellation_reason = 'Converted to Freedom Platform period payment',
    updated_at = now()
  where id = expense_row.id;

  return payment_row;
end;
$$;

grant execute on function public.convert_expense_to_platform_period_payment(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
