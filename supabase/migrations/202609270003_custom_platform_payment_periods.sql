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
begin
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Only organization admins can report platform payments.';
  end if;
  if target_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;
  if target_period_start is null or target_period_end is null or target_period_end < target_period_start then
    raise exception 'Platform payment period is invalid.';
  end if;

  -- Serialize period creation per organization so concurrent submissions cannot overlap.
  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));

  if exists (
    select 1
    from public.platform_share_payments
    where organization_id = target_organization_id
      and billing_period_start <= target_period_end
      and billing_period_end >= target_period_start
      and status <> 'rejected'
  ) then
    raise exception 'This platform payment period overlaps an existing payment.';
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

grant execute on function public.report_platform_period_payment(uuid, date, date, numeric, public.finance_payment_method, date, text, text) to authenticated;
