drop view if exists public.employee_products;

create view public.employee_products
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
  sort_order,
  status,
  stock_quantity,
  minimum_stock_quantity,
  track_stock
from public.products
where status = 'active'
  and public.is_organization_member(organization_id);

grant select on public.employee_products to authenticated;
