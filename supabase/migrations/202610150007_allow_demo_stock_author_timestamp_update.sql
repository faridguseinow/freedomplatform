-- The generic updated_at trigger runs during author consolidation; no business stock fields may change.

create or replace function public.prevent_stock_movement_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.system_purge', true) = '1' then
      return old;
    end if;
    raise exception 'Stock movements are immutable.';
  end if;

  if tg_op = 'UPDATE' then
    if current_setting('app.demo_user_consolidation', true) = '1'
      and auth.role() = 'service_role'
      and (to_jsonb(new) - 'created_by' - 'updated_at') =
          (to_jsonb(old) - 'created_by' - 'updated_at')
      and exists (
        select 1
        from public.organizations o
        where o.id = old.organization_id
          and o.slug = 'demo'
      )
    then
      return new;
    end if;

    raise exception 'Stock movements are immutable.';
  end if;

  if current_setting('app.inventory_write', true) <> '1' then
    raise exception 'Stock movements can be created only by inventory functions.';
  end if;

  return new;
end;
$$;
