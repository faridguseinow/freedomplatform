create or replace view public.employee_products
with (security_invoker = false, security_barrier = true)
as
select
  id,
  organization_id,
  category_id,
  sku,
  name,
  description,
  characteristics,
  image_path,
  sale_price,
  unit_name,
  stock_quantity,
  minimum_stock_quantity,
  track_stock,
  sort_order,
  status
from public.products
where status = 'active'
  and public.is_organization_member(organization_id);

grant select on public.employee_products to authenticated;
