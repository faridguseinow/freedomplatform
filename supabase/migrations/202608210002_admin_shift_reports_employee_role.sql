create or replace view public.admin_shift_reports
with (security_barrier = true)
as
select
  es.*,
  od.business_date,
  st.name as shift_template_name,
  p.email as employee_email,
  p.full_name as employee_full_name,
  om.role as employee_role
from public.employee_shifts es
join public.operational_days od on od.id = es.operational_day_id
left join public.shift_templates st on st.id = es.shift_template_id
left join public.profiles p on p.id = es.employee_user_id
left join public.organization_memberships om
  on om.organization_id = es.organization_id
  and om.user_id = es.employee_user_id
  and om.is_active = true
where public.is_organization_admin(es.organization_id);

grant select on public.admin_shift_reports to authenticated;
