-- Allow platform owners to permanently delete financial periods through RPC.
-- Direct table deletes remain blocked unless an internal finance RPC sets app.finance_write = 1.

create or replace function public.prevent_finance_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return coalesce(new, old);
  end if;

  if current_setting('app.finance_write', true) <> '1' then
    raise exception 'Finance records can be changed only through finance RPC functions.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.delete_financial_period(
  target_period_id uuid,
  target_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row public.financial_periods;
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can delete financial periods.';
  end if;

  select * into period_row
  from public.financial_periods
  where id = target_period_id
  for update;

  if period_row.id is null then
    raise exception 'Financial period was not found.';
  end if;

  perform set_config('app.finance_write', '1', true);

  perform public.finance_log(
    period_row.organization_id,
    'finance.period_deleted',
    'financial_period',
    period_row.id,
    to_jsonb(period_row),
    null,
    target_comment
  );

  delete from public.financial_periods
  where id = target_period_id;

  return target_period_id;
end;
$$;

grant execute on function public.delete_financial_period(uuid, text) to authenticated;
