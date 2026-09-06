-- Treat the quantity of an hourly service inside a combo as hours of included session time.

alter table public.combo_components disable trigger combo_components_scope;

update public.combo_components as component
set included_minutes = 60
from public.services as service
where component.service_id = service.id
  and component.component_type = 'service'
  and service.pricing_type = 'hourly'
  and component.included_minutes is null;

alter table public.combo_components enable trigger combo_components_scope;
 