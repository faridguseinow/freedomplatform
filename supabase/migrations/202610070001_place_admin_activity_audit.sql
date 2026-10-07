-- Record important place changes made from the admin panel.

create or replace function public.audit_place_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_settings jsonb;
  after_settings jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.log_audit(
      new.organization_id,
      'place.created',
      'place',
      new.id,
      jsonb_build_object('place_name', new.name)
    );
    return new;
  end if;

  if old.has_timer is distinct from new.has_timer
    or old.hourly_rate is distinct from new.hourly_rate
    or old.minimum_minutes is distinct from new.minimum_minutes
    or old.billing_step_minutes is distinct from new.billing_step_minutes
  then
    before_settings := jsonb_build_object(
      'has_timer', old.has_timer,
      'hourly_rate', old.hourly_rate,
      'minimum_minutes', old.minimum_minutes,
      'billing_step_minutes', old.billing_step_minutes
    );
    after_settings := jsonb_build_object(
      'has_timer', new.has_timer,
      'hourly_rate', new.hourly_rate,
      'minimum_minutes', new.minimum_minutes,
      'billing_step_minutes', new.billing_step_minutes
    );

    perform public.log_audit(
      new.organization_id,
      'place.session_settings_updated',
      'place',
      new.id,
      jsonb_build_object(
        'place_name', new.name,
        'before', before_settings,
        'after', after_settings
      )
    );
  elsif old.status is distinct from new.status then
    perform public.log_audit(
      new.organization_id,
      'place.status_updated',
      'place',
      new.id,
      jsonb_build_object(
        'place_name', new.name,
        'before_status', old.status,
        'after_status', new.status
      )
    );
  elsif old.name is distinct from new.name
    or old.type is distinct from new.type
    or old.custom_type_name is distinct from new.custom_type_name
    or old.description is distinct from new.description
    or old.image_path is distinct from new.image_path
    or old.category_id is distinct from new.category_id
    or old.capacity is distinct from new.capacity
    or old.sort_order is distinct from new.sort_order
  then
    perform public.log_audit(
      new.organization_id,
      'place.updated',
      'place',
      new.id,
      jsonb_build_object('place_name', new.name)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_place_admin_changes_trigger on public.places;
create trigger audit_place_admin_changes_trigger
after insert or update on public.places
for each row execute function public.audit_place_admin_changes();
