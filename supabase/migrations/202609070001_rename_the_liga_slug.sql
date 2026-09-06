do $$
begin
  if exists (
    select 1
    from public.organizations
    where slug = 'theliga'
  ) and exists (
    select 1
    from public.organizations
    where slug = 'the-liga'
  ) then
    raise exception 'Cannot rename organization slug: theliga is already in use.';
  end if;

end;
$$;

-- This is a system-field migration, so bypass only the application write guard
-- for the duration of this transaction. RLS and every other trigger stay enabled.
alter table public.organizations disable trigger organizations_restricted_update;

update public.organizations
set slug = 'theliga',
    updated_at = now()
where slug = 'the-liga';

alter table public.organizations enable trigger organizations_restricted_update;
