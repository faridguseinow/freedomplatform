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

  update public.organizations
  set slug = 'theliga',
      updated_at = now()
  where slug = 'the-liga';
end;
$$;
