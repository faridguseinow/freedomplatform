create or replace function public.convert_expense_to_platform_payment(
  target_transaction_id uuid,
  target_accrual_id uuid
)
returns public.platform_share_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_row public.finance_transactions;
  accrual_row public.platform_share_accruals;
  payment_row public.platform_share_payments;
  pending_amount numeric(14,2);
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

  select * into accrual_row
  from public.platform_share_accruals
  where id = target_accrual_id
  for update;

  if accrual_row.id is null or accrual_row.organization_id <> expense_row.organization_id then
    raise exception 'Platform payment debt is invalid.';
  end if;

  select coalesce(sum(amount), 0)
  into pending_amount
  from public.platform_share_payments
  where accrual_id = accrual_row.id
    and status = 'reported_sent';

  if expense_row.amount > accrual_row.outstanding_amount - pending_amount then
    raise exception 'Payment amount exceeds the remaining platform debt.';
  end if;

  perform set_config('app.finance_write', '1', true);

  insert into public.platform_share_payments (
    organization_id,
    accrual_id,
    amount,
    payment_method,
    payment_date,
    reference,
    marked_sent_by,
    marked_sent_at,
    status,
    comment
  )
  values (
    expense_row.organization_id,
    accrual_row.id,
    expense_row.amount,
    expense_row.payment_method,
    coalesce(expense_row.paid_date, expense_row.accrual_date),
    expense_row.title,
    auth.uid(),
    now(),
    'reported_sent',
    expense_row.description
  )
  returning * into payment_row;

  update public.finance_transactions
  set
    status = 'cancelled',
    paid_amount = 0,
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    cancellation_reason = 'Converted to Freedom Platform payment',
    updated_at = now()
  where id = expense_row.id;

  update public.platform_share_accruals
  set
    status = 'pending_approval',
    updated_at = now()
  where id = accrual_row.id;

  perform public.finance_log(
    expense_row.organization_id,
    'finance.expense_converted_to_platform_payment',
    'platform_share_payment',
    payment_row.id,
    to_jsonb(expense_row),
    to_jsonb(payment_row)
  );

  return payment_row;
end;
$$;

grant execute on function public.convert_expense_to_platform_payment(uuid, uuid) to authenticated;

-- Convert the previously recorded September platform transfer for The Liga.
-- The strict match keeps unrelated expenses untouched and makes the migration idempotent.
do $$
declare
  expense_row public.finance_transactions;
  accrual_row public.platform_share_accruals;
  payment_id uuid;
begin
  select ft.* into expense_row
  from public.finance_transactions ft
  join public.organizations o on o.id = ft.organization_id
  where o.slug = 'theliga'
    and ft.transaction_type = 'expense'
    and ft.source_type = 'manual'
    and upper(btrim(ft.title)) = 'FERID'
    and ft.amount = 200
    and ft.payment_method = 'card_transfer'
    and coalesce(ft.paid_date, ft.accrual_date) = date '2026-09-15'
    and ft.status <> 'cancelled'
  order by ft.created_at desc
  limit 1
  for update of ft;

  if expense_row.id is null then
    return;
  end if;

  select psa.* into accrual_row
  from public.platform_share_accruals psa
  join public.financial_periods fp on fp.id = psa.financial_period_id
  where psa.organization_id = expense_row.organization_id
    and fp.period_start = date '2026-08-15'
    and fp.period_end = date '2026-09-14'
    and psa.outstanding_amount >= expense_row.amount
  limit 1
  for update of psa;

  if accrual_row.id is null or exists (
    select 1
    from public.platform_share_payments p
    where p.organization_id = expense_row.organization_id
      and p.reference = expense_row.title
      and p.amount = expense_row.amount
      and p.payment_date = date '2026-09-15'
      and p.status <> 'rejected'
  ) then
    return;
  end if;

  perform set_config('app.finance_write', '1', true);

  insert into public.platform_share_payments (
    organization_id,
    accrual_id,
    amount,
    payment_method,
    payment_date,
    reference,
    marked_sent_by,
    marked_sent_at,
    status,
    comment
  )
  values (
    expense_row.organization_id,
    accrual_row.id,
    expense_row.amount,
    expense_row.payment_method,
    date '2026-09-15',
    expense_row.title,
    expense_row.created_by,
    now(),
    'reported_sent',
    coalesce(expense_row.description, 'Previous month Freedom Platform payment')
  )
  returning id into payment_id;

  update public.finance_transactions
  set
    status = 'cancelled',
    paid_amount = 0,
    cancelled_by = expense_row.created_by,
    cancelled_at = now(),
    cancellation_reason = 'Converted to Freedom Platform payment',
    updated_at = now()
  where id = expense_row.id;

  update public.platform_share_accruals
  set status = 'pending_approval', updated_at = now()
  where id = accrual_row.id;

  perform public.finance_log(
    expense_row.organization_id,
    'finance.expense_converted_to_platform_payment',
    'platform_share_payment',
    payment_id,
    to_jsonb(expense_row),
    jsonb_build_object('payment_id', payment_id, 'migration', true)
  );
end;
$$;
