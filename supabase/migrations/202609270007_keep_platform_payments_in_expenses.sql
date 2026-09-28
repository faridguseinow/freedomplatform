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
  platform_category_id uuid;
  is_approved_historical_payment boolean;
begin
  select * into expense_row
  from public.finance_transactions
  where id = target_transaction_id
  for update;

  if expense_row.id is null then raise exception 'Expense was not found.'; end if;
  if not public.is_organization_admin(expense_row.organization_id) then
    raise exception 'Only organization admins can convert expenses.';
  end if;
  if expense_row.transaction_type <> 'expense'
    or expense_row.source_type <> 'manual'
    or expense_row.status = 'cancelled'
  then
    raise exception 'Only active manual expenses can be converted.';
  end if;

  is_approved_historical_payment :=
    upper(btrim(expense_row.title)) = 'FERID'
    and expense_row.amount = 200
    and expense_row.payment_method = 'card_transfer'
    and expense_row.accrual_date = date '2026-09-14'
    and expense_row.paid_date = date '2026-09-15';

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

  perform public.seed_standard_finance_categories(expense_row.organization_id);
  select id into platform_category_id
  from public.finance_categories
  where organization_id = expense_row.organization_id
    and system_code = 'platform_share_payment'
  limit 1;

  perform set_config('app.finance_write', '1', true);
  if is_approved_historical_payment then
    perform set_config('app.locked_platform_conversion_id', expense_row.id::text, true);
  end if;

  update public.finance_transactions
  set
    transaction_type = 'platform_share_payment',
    category_id = platform_category_id,
    status = 'paid',
    paid_amount = amount,
    reference = 'platform-payment:' || payment_row.id::text,
    affects_profit = false,
    affects_cash_flow = true,
    eligible_for_platform_share_deduction = false,
    cancelled_by = null,
    cancelled_at = null,
    cancellation_reason = null,
    updated_at = now()
  where id = expense_row.id;

  return payment_row;
end;
$$;

create or replace function public.confirm_platform_share_payment(
  target_payment_id uuid,
  target_decision text,
  target_comment text default null
)
returns public.platform_share_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.platform_share_payments;
  accrual_row public.platform_share_accruals;
  category_id uuid;
  new_paid_amount numeric(14,2);
  payment_title text;
  transaction_reference text;
begin
  if not public.is_platform_owner() then raise exception 'Only platform owners can confirm platform payments.'; end if;
  if target_decision not in ('confirmed', 'rejected') then
    raise exception 'Decision must be confirmed or rejected.';
  end if;

  select * into payment_row
  from public.platform_share_payments
  where id = target_payment_id
  for update;

  if payment_row.id is null then raise exception 'Platform payment was not found.'; end if;
  if payment_row.status <> 'reported_sent' then raise exception 'Only reported payments can be reviewed.'; end if;

  if payment_row.accrual_id is not null then
    select * into accrual_row
    from public.platform_share_accruals
    where id = payment_row.accrual_id
    for update;
  end if;

  perform set_config('app.finance_write', '1', true);

  update public.platform_share_payments
  set
    status = target_decision,
    confirmed_received_by = auth.uid(),
    confirmed_received_at = now(),
    comment = coalesce(target_comment, comment),
    updated_at = now()
  where id = target_payment_id
  returning * into payment_row;

  if target_decision = 'confirmed' then
    if accrual_row.id is not null then
      new_paid_amount := accrual_row.paid_amount + payment_row.amount;
      update public.platform_share_accruals
      set
        paid_amount = new_paid_amount,
        status = case
          when new_paid_amount >= accrued_amount then 'paid'::public.platform_share_status
          when new_paid_amount > 0 then 'partially_paid'::public.platform_share_status
          else 'approved'::public.platform_share_status
        end,
        fully_paid_at = case when new_paid_amount >= accrued_amount then now() else null end,
        updated_at = now()
      where id = accrual_row.id;
    end if;

    transaction_reference := 'platform-payment:' || payment_row.id::text;
    if not exists (
      select 1
      from public.finance_transactions
      where organization_id = payment_row.organization_id
        and reference = transaction_reference
        and status <> 'cancelled'
    ) then
      perform public.seed_standard_finance_categories(payment_row.organization_id);
      select id into category_id
      from public.finance_categories
      where organization_id = payment_row.organization_id
        and system_code = 'platform_share_payment'
      limit 1;

      payment_title := case
        when payment_row.billing_period_start is not null then
          'Freedom Platform ödənişi: ' || payment_row.billing_period_start::text || ' - ' || payment_row.billing_period_end::text
        else 'Freedom Platform ödənişi'
      end;

      insert into public.finance_transactions (
        organization_id, transaction_type, category_id, source_type, source_id, title,
        amount, paid_amount, status, payment_method, accrual_date, paid_date, reference,
        document_path, affects_profit, affects_cash_flow,
        eligible_for_platform_share_deduction, created_by
      )
      values (
        payment_row.organization_id, 'platform_share_payment', category_id, 'platform_share',
        payment_row.id, payment_title, payment_row.amount, payment_row.amount, 'paid',
        payment_row.payment_method, payment_row.payment_date, payment_row.payment_date,
        transaction_reference, payment_row.document_path, false, true, false, auth.uid()
      );
    end if;
  end if;

  perform public.finance_log(
    payment_row.organization_id,
    'finance.platform_share_payment_' || target_decision,
    'platform_share_payment',
    payment_row.id,
    null,
    to_jsonb(payment_row),
    target_comment
  );
  return payment_row;
end;
$$;

-- Restore expenses already converted by the previous implementation. Their
-- original accounting dates are preserved, so closed-period totals remain correct.
do $$
declare
  restored_row record;
  platform_category_id uuid;
begin
  for restored_row in
    select distinct on (ft.id)
      ft.id as transaction_id,
      ft.organization_id,
      p.id as payment_id
    from public.finance_transactions ft
    join public.platform_share_payments p
      on p.organization_id = ft.organization_id
      and p.reference = ft.title
      and p.amount = ft.amount
      and p.payment_date = coalesce(ft.paid_date, ft.accrual_date)
      and p.status <> 'rejected'
    where ft.source_type = 'manual'
      and ft.status = 'cancelled'
      and ft.cancellation_reason in (
        'Converted to Freedom Platform calendar payment',
        'Converted to Freedom Platform period payment'
      )
    order by ft.id, p.created_at desc
  loop
    perform public.seed_standard_finance_categories(restored_row.organization_id);
    select id into platform_category_id
    from public.finance_categories
    where organization_id = restored_row.organization_id
      and system_code = 'platform_share_payment'
    limit 1;

    perform set_config('app.finance_write', '1', true);
    perform set_config('app.locked_platform_conversion_id', restored_row.transaction_id::text, true);

    update public.finance_transactions
    set
      transaction_type = 'platform_share_payment',
      category_id = platform_category_id,
      status = 'paid',
      paid_amount = amount,
      reference = 'platform-payment:' || restored_row.payment_id::text,
      affects_profit = false,
      affects_cash_flow = true,
      eligible_for_platform_share_deduction = false,
      cancelled_by = null,
      cancelled_at = null,
      cancellation_reason = null,
      updated_at = now()
    where id = restored_row.transaction_id;
  end loop;
end;
$$;

grant execute on function public.convert_expense_to_platform_period_payment(uuid, date, date) to authenticated;
grant execute on function public.confirm_platform_share_payment(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
