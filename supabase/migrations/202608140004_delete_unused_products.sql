-- Allow organization admins to permanently delete only unused products.

create or replace function public.delete_unused_product(
  target_product_id uuid,
  target_reason text default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.products;
begin
  select * into item from public.products where id = target_product_id;

  if item.id is null then
    raise exception 'Product was not found.';
  end if;

  if not (public.is_platform_owner() or public.is_organization_admin(item.organization_id)) then
    raise exception 'Only organization admins can delete products.';
  end if;

  if item.track_stock and item.stock_quantity <> 0 then
    raise exception 'Product stock must be zero before deletion.';
  end if;

  if exists (select 1 from public.order_items where product_id = target_product_id)
    or exists (select 1 from public.stock_document_items where product_id = target_product_id)
    or exists (select 1 from public.stock_movements where product_id = target_product_id)
    or exists (select 1 from public.stock_reservations where product_id = target_product_id)
    or exists (select 1 from public.combo_components where product_id = target_product_id)
  then
    raise exception 'Product has already been used and cannot be deleted. Archive it instead.';
  end if;

  delete from public.products where id = target_product_id;

  perform public.log_audit(
    item.organization_id,
    'catalog.product_deleted',
    'product',
    item.id,
    jsonb_build_object(
      'name', item.name,
      'sku', item.sku,
      'reason', nullif(btrim(coalesce(target_reason, '')), '')
    )
  );

  return item;
end;
$$;

grant execute on function public.delete_unused_product(uuid, text) to authenticated;
