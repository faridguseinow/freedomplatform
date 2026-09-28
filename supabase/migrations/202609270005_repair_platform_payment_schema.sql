-- Repair installations where the RPC migrations were applied without the
-- calendar-period columns from the original schema migration.
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
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can confirm platform payments.';
  end if;
  if target_decision not in ('confirmed', 'rejected') then
    raise exception 'Decision must be confirmed or rejected.';
  end if;

  select * into payment_row
  from public.platform_share_payments
  where id = target_payment_id
  for update;

  if payment_row.id is null then
    raise exception 'Platform payment was not found.';
  end if;
  if payment_row.status <> 'reported_sent' then
    raise exception 'Only reported payments can be reviewed.';
  end if;

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

grant execute on function public.confirm_platform_share_payment(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
