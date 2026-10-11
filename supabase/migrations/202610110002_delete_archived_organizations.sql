-- Allow platform owners to permanently delete an organization only after it is archived.

create or replace function public.delete_archived_organization(
  target_organization_id uuid,
  target_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_row public.organizations;
begin
  if not public.is_platform_owner() then
    raise exception 'Only platform owners can permanently delete organizations.';
  end if;

  select *
  into organization_row
  from public.organizations
  where id = target_organization_id
  for update;

  if organization_row.id is null then
    raise exception 'Organization was not found.';
  end if;

  if organization_row.status <> 'archived' then
    raise exception 'Archive the organization before deleting it permanently.';
  end if;

  if btrim(coalesce(target_confirmation, '')) <> organization_row.name then
    raise exception 'Organization name confirmation does not match.';
  end if;

  perform set_config('app.system_purge', '1', true);
  perform set_config('app.order_write', '1', true);
  perform set_config('app.finance_write', '1', true);
  perform set_config('app.shift_write', '1', true);
  perform set_config('app.shift_hard_delete', '1', true);
  perform set_config('app.inventory_write', '1', true);

  delete from public.organizations
  where id = organization_row.id;

  return jsonb_build_object(
    'organization_id', organization_row.id,
    'organization_name', organization_row.name,
    'deleted', true
  );
end;
$$;

revoke all on function public.delete_archived_organization(uuid, text) from public;
grant execute on function public.delete_archived_organization(uuid, text) to authenticated;
