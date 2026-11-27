-- Security advisor: functions with a role-mutable search_path.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'finance_payment_method_from_order',
        'inventory_quantity_sign',
        'is_opening_day_shift_name',
        'next_recurring_expense_date'
      ])
  loop
    execute format('alter function %s set search_path = public', fn.signature);
  end loop;
end;
$$;
