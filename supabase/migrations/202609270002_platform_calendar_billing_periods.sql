alter table public.platform_share_payments
  alter column accrual_id drop not null,
  add column if not exists billing_period_start date,
  add column if not exists billing_period_end date;

alter table public.platform_share_payments
  drop constraint if exists platform_share_payments_billing_period_check;

alter table public.platform_share_payments
  add constraint platform_share_payments_billing_period_check check (
    (billing_period_start is null and billing_period_end is null)
    or (
      billing_period_start is not null
      and billing_period_end is not null
      and billing_period_end >= billing_period_start
    )
  );

create unique index if not exists platform_share_payments_active_billing_period_key
on public.platform_share_payments (organization_id, billing_period_start, billing_period_end)
where billing_period_start is not null
  and billing_period_end is not null
  and status <> 'rejected';

create or replace function public.report_platform_period_payment(
  target_organization_id uuid,
  target_period_start date,
  target_period_end date,
  target_amount numeric,
  target_payment_method public.finance_payment_method,
  target_payment_date date,
  target_reference text default null,
  target_comment text default null
)
returns public.platform_share_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.platform_share_payments;
  expected_period_end date;
begin
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Only organization admins can report platform payments.';
  end if;
  if target_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;

  expected_period_end := (date_trunc('month', target_period_start)::date + interval '1 month - 1 day')::date;
  if not (
    (target_period_start = date '2026-09-15' and target_period_end = date '2026-09-30')
    or (
      extract(day from target_period_start) = 1
      and target_period_end = expected_period_end
      and target_period_start >= date '2026-10-01'
    )
  ) then
    raise exception 'Platform payment period must cover a full calendar month.';
  end if;

  if exists (
    select 1
    from public.platform_share_payments
    where organization_id = target_organization_id
      and billing_period_start = target_period_start
      and billing_period_end = target_period_end
      and status <> 'rejected'
  ) then
    raise exception 'This platform payment period has already been submitted.';
  end if;

  perform set_config('app.finance_write', '1', true);

  insert into public.platform_share_payments (
    organization_id,
    accrual_id,
    billing_period_start,
    billing_period_end,
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
    target_organization_id,
    null,
    target_period_start,
    target_period_end,
    target_amount,
    target_payment_method,
    target_payment_date,
    target_reference,
    auth.uid(),
    now(),
    'reported_sent',
    target_comment
  )
  returning * into payment_row;

  perform public.finance_log(
    target_organization_id,
    'finance.platform_period_payment_reported',
    'platform_share_payment',
    payment_row.id,
    null,
    to_jsonb(payment_row)
  );

  return payment_row;
end;
$$;

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
    cancellation_reason = 'Converted to Freedom Platform calendar payment',
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
      payment_row.reference, payment_row.document_path, false, true, false, auth.uid()
    )
    on conflict do nothing;
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

-- The previously reported transfer covers the one-off transition period.
with previous_payment as (
  select p.id
  from public.platform_share_payments p
  join public.organizations o on o.id = p.organization_id
  where o.slug = 'theliga'
    and p.amount = 200
    and p.payment_method = 'card_transfer'
    and p.payment_date = date '2026-09-15'
    and p.status <> 'rejected'
    and p.billing_period_start is null
  order by p.created_at desc
  limit 1
)
update public.platform_share_payments p
set
  billing_period_start = date '2026-09-15',
  billing_period_end = date '2026-09-30',
  updated_at = now()
from previous_payment
where p.id = previous_payment.id;

grant execute on function public.report_platform_period_payment(uuid, date, date, numeric, public.finance_payment_method, date, text, text) to authenticated;
grant execute on function public.convert_expense_to_platform_period_payment(uuid, date, date) to authenticated;
