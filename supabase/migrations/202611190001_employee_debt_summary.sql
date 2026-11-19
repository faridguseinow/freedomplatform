create or replace function public.get_employee_debt_summary(target_organization_id uuid)
returns table (
  debt_id uuid,
  customer_name text,
  incurred_on date,
  due_on date,
  balance_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    debt.id,
    debt.customer_name,
    debt.incurred_on,
    debt.due_on,
    debt.balance_amount
  from public.customer_debts debt
  where debt.organization_id = target_organization_id
    and public.is_organization_member(target_organization_id)
    and debt.status in ('open', 'partial')
    and debt.balance_amount > 0
  order by debt.due_on asc nulls last, debt.incurred_on asc, debt.created_at asc;
$$;

revoke all on function public.get_employee_debt_summary(uuid) from public;
grant execute on function public.get_employee_debt_summary(uuid) to authenticated;

notify pgrst, 'reload schema';
