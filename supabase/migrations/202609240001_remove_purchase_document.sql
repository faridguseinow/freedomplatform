create or replace function public.remove_purchase_stock_document(
  target_document_id uuid,
  target_reason text default 'Removed from purchase history'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.stock_documents;
  cancelled_document public.stock_documents;
  old_finance_row public.finance_transactions;
  cancelled_finance_row public.finance_transactions;
begin
  select *
  into document_row
  from public.stock_documents
  where id = target_document_id
  for update;

  if document_row.id is null then
    raise exception 'Purchase document was not found.';
  end if;
  if document_row.type <> 'purchase' then
    raise exception 'Only purchase documents can be removed from purchase history.';
  end if;
  if document_row.status = 'cancelled' then
    raise exception 'Purchase document is already removed.';
  end if;
  if not (public.is_platform_owner() or public.is_organization_admin(document_row.organization_id)) then
    raise exception 'Only organization admins can remove purchase documents.';
  end if;

  cancelled_document := public.cancel_stock_document(target_document_id, target_reason);

  select *
  into old_finance_row
  from public.finance_transactions
  where organization_id = document_row.organization_id
    and transaction_type = 'purchase'
    and source_type = 'stock_document'
    and source_id = document_row.id
  for update;

  if old_finance_row.id is not null and old_finance_row.status <> 'cancelled' then
    perform set_config('app.finance_write', '1', true);

    update public.finance_transactions
    set
      status = 'cancelled',
      paid_amount = 0,
      paid_date = null,
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancellation_reason = target_reason,
      updated_at = now()
    where id = old_finance_row.id
    returning * into cancelled_finance_row;

    perform public.finance_log(
      document_row.organization_id,
      'finance.purchase_cancelled',
      'finance_transaction',
      cancelled_finance_row.id,
      to_jsonb(old_finance_row),
      to_jsonb(cancelled_finance_row),
      target_reason
    );
  end if;

  return jsonb_build_object(
    'document_id', cancelled_document.id,
    'organization_id', cancelled_document.organization_id,
    'status', cancelled_document.status,
    'finance_transaction_id', cancelled_finance_row.id
  );
end;
$$;

grant execute on function public.remove_purchase_stock_document(uuid, text) to authenticated;
