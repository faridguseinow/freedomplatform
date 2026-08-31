create or replace function public.is_opening_day_shift_name(target_name text)
returns boolean
language sql
immutable
as $$
  select false;
$$;

create or replace function public.is_opening_day_shift(target_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

alter table public.shift_templates disable trigger shift_templates_write_guard;

update public.shift_templates
set
  is_active = false,
  updated_at = now()
where lower(btrim(name)) in ('день открытия', 'opening ceremony', 'opening day');

alter table public.shift_templates enable trigger shift_templates_write_guard;

grant execute on function public.is_opening_day_shift_name(text) to authenticated;
grant execute on function public.is_opening_day_shift(uuid) to authenticated;
