-- Protect organization finance screens with a server-verified four-digit PIN.
-- The PIN hash and failed-attempt counters are never readable by clients.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.organization_finance_pins (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  pin_hash text not null,
  pin_set_at timestamptz not null default now(),
  pin_updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_finance_pin_attempts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

drop trigger if exists organization_finance_pins_set_updated_at on public.organization_finance_pins;
create trigger organization_finance_pins_set_updated_at
before update on public.organization_finance_pins
for each row execute function public.set_updated_at();

drop trigger if exists organization_finance_pin_attempts_set_updated_at on public.organization_finance_pin_attempts;
create trigger organization_finance_pin_attempts_set_updated_at
before update on public.organization_finance_pin_attempts
for each row execute function public.set_updated_at();

alter table public.organization_finance_pins enable row level security;
alter table public.organization_finance_pin_attempts enable row level security;

revoke all on public.organization_finance_pins from anon, authenticated;
revoke all on public.organization_finance_pin_attempts from anon, authenticated;

create or replace function public.get_finance_pin_state(target_organization_id uuid)
returns table (
  has_pin boolean,
  pin_set_at timestamptz,
  locked_until timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Organization administrator access is required.';
  end if;

  return query
  select
    ofp.pin_hash is not null,
    ofp.pin_set_at,
    case when attempts.locked_until > now() then attempts.locked_until else null end
  from (select 1) seed
  left join public.organization_finance_pins ofp
    on ofp.organization_id = target_organization_id
  left join public.organization_finance_pin_attempts attempts
    on attempts.organization_id = target_organization_id
   and attempts.user_id = auth.uid();
end;
$$;

create or replace function public.set_finance_pin(
  target_organization_id uuid,
  target_pin text,
  target_account_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if target_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must contain exactly 4 digits.';
  end if;

  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Only organization administrators can set the finance PIN.';
  end if;

  if not exists (
    select 1
    from auth.users account
    where account.id = auth.uid()
      and account.encrypted_password is not null
      and crypt(target_account_password, account.encrypted_password) = account.encrypted_password
  ) then
    raise exception 'The account password is incorrect.';
  end if;

  insert into public.organization_finance_pins (
    organization_id,
    pin_hash,
    pin_set_at,
    pin_updated_by
  )
  values (
    target_organization_id,
    crypt(target_pin, gen_salt('bf')),
    now(),
    auth.uid()
  )
  on conflict (organization_id) do update set
    pin_hash = excluded.pin_hash,
    pin_set_at = excluded.pin_set_at,
    pin_updated_by = excluded.pin_updated_by,
    updated_at = now();

  delete from public.organization_finance_pin_attempts
  where organization_id = target_organization_id;

  perform public.log_audit(
    target_organization_id,
    'finance.pin_updated',
    'organization',
    target_organization_id,
    '{}'::jsonb
  );
end;
$$;

create or replace function public.verify_finance_pin(
  target_organization_id uuid,
  target_pin text
)
returns table (
  is_valid boolean,
  locked_until timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored_hash text;
  attempt_row public.organization_finance_pin_attempts;
  next_failed_attempts integer;
  next_locked_until timestamptz;
begin
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Organization administrator access is required.';
  end if;

  select pin_hash into stored_hash
  from public.organization_finance_pins
  where organization_id = target_organization_id;

  if stored_hash is null or target_pin !~ '^[0-9]{4}$' then
    return query select false, null::timestamptz;
    return;
  end if;

  select * into attempt_row
  from public.organization_finance_pin_attempts
  where organization_id = target_organization_id
    and user_id = auth.uid()
  for update;

  if attempt_row.locked_until > now() then
    return query select false, attempt_row.locked_until;
    return;
  end if;

  if crypt(target_pin, stored_hash) = stored_hash then
    delete from public.organization_finance_pin_attempts
    where organization_id = target_organization_id
      and user_id = auth.uid();

    return query select true, null::timestamptz;
    return;
  end if;

  next_failed_attempts := coalesce(attempt_row.failed_attempts, 0) + 1;
  next_locked_until := case
    when next_failed_attempts >= 5 then now() + interval '5 minutes'
    else null
  end;

  insert into public.organization_finance_pin_attempts (
    organization_id,
    user_id,
    failed_attempts,
    locked_until
  )
  values (
    target_organization_id,
    auth.uid(),
    case when next_locked_until is null then next_failed_attempts else 0 end,
    next_locked_until
  )
  on conflict (organization_id, user_id) do update set
    failed_attempts = excluded.failed_attempts,
    locked_until = excluded.locked_until,
    updated_at = now();

  return query select false, next_locked_until;
end;
$$;

grant execute on function public.get_finance_pin_state(uuid) to authenticated;
grant execute on function public.set_finance_pin(uuid, text, text) to authenticated;
grant execute on function public.verify_finance_pin(uuid, text) to authenticated;

