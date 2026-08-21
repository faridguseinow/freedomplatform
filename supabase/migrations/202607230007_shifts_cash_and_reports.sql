-- Shifts, cash responsibility, operational day reports, and Telegram notification outbox.
-- No Telegram bot token, service-role key, real emails, passwords, or destructive SQL are stored here.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'shift_status') then
    create type public.shift_status as enum ('open', 'closing', 'closed', 'force_closed');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'shift_handover_status') then
    create type public.shift_handover_status as enum ('pending', 'accepted', 'completed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'cash_variance_status') then
    create type public.cash_variance_status as enum ('balanced', 'shortage', 'overage');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'notification_outbox_status') then
    create type public.notification_outbox_status as enum ('pending', 'processing', 'sent', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'notification_type') then
    create type public.notification_type as enum (
      'shift_opened',
      'shift_closed',
      'shift_not_closed',
      'daily_summary',
      'cash_shortage',
      'cash_overage',
      'payment_refused',
      'adjustment_requested',
      'adjustment_reviewed',
      'low_stock',
      'custom'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'operational_day_status') then
    create type public.operational_day_status as enum ('open', 'waiting_final_shift', 'completed', 'corrected');
  end if;
end
$$;

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  expected_duration_minutes integer,
  late_close_grace_minutes integer not null default 15,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_name_check check (length(btrim(name)) > 0),
  constraint shift_templates_sort_order_check check (sort_order >= 0),
  constraint shift_templates_expected_duration_check check (expected_duration_minutes is null or expected_duration_minutes > 0),
  constraint shift_templates_grace_check check (late_close_grace_minutes >= 0),
  constraint shift_templates_midnight_check check (end_time >= start_time or crosses_midnight = true)
);

create index if not exists shift_templates_organization_id_idx on public.shift_templates (organization_id);
create index if not exists shift_templates_organization_active_idx on public.shift_templates (organization_id, is_active);
create index if not exists shift_templates_organization_sort_idx on public.shift_templates (organization_id, sort_order);

create table if not exists public.operational_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_date date not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status public.operational_day_status not null default 'open',
  total_revenue numeric(14,2) not null default 0,
  cash_revenue numeric(14,2) not null default 0,
  card_transfer_revenue numeric(14,2) not null default 0,
  unpaid_total numeric(14,2) not null default 0,
  payment_refused_total numeric(14,2) not null default 0,
  total_orders integer not null default 0,
  paid_orders integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_days_unique_business_date unique (organization_id, business_date),
  constraint operational_days_amounts_check check (
    total_revenue >= 0 and cash_revenue >= 0 and card_transfer_revenue >= 0
    and unpaid_total >= 0 and payment_refused_total >= 0
  ),
  constraint operational_days_counters_check check (total_orders >= 0 and paid_orders >= 0)
);

create index if not exists operational_days_organization_id_idx on public.operational_days (organization_id);
create index if not exists operational_days_business_date_idx on public.operational_days (organization_id, business_date desc);
create index if not exists operational_days_status_idx on public.operational_days (organization_id, status);

create table if not exists public.employee_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  operational_day_id uuid not null references public.operational_days(id) on delete cascade,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  employee_user_id uuid not null references auth.users(id),
  status public.shift_status not null default 'open',
  opened_at timestamptz not null default now(),
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  closed_at timestamptz,
  opening_cash_amount numeric(14,2) not null default 0,
  expected_cash_amount numeric(14,2),
  actual_cash_amount numeric(14,2),
  cash_variance numeric(14,2),
  cash_variance_status public.cash_variance_status,
  cash_variance_comment text,
  cash_sales_total numeric(14,2) not null default 0,
  card_transfer_sales_total numeric(14,2) not null default 0,
  paid_orders_total numeric(14,2) not null default 0,
  unpaid_orders_total numeric(14,2) not null default 0,
  payment_refused_total numeric(14,2) not null default 0,
  completed_orders_count integer not null default 0,
  payment_refused_count integer not null default 0,
  opened_orders_count integer not null default 0,
  transferred_orders_count integer not null default 0,
  closing_comment text,
  force_closed_by uuid references auth.users(id),
  force_close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_shifts_amounts_check check (
    opening_cash_amount >= 0
    and (expected_cash_amount is null or expected_cash_amount >= 0)
    and (actual_cash_amount is null or actual_cash_amount >= 0)
    and cash_sales_total >= 0
    and card_transfer_sales_total >= 0
    and paid_orders_total >= 0
    and unpaid_orders_total >= 0
    and payment_refused_total >= 0
  ),
  constraint employee_shifts_counters_check check (
    completed_orders_count >= 0 and payment_refused_count >= 0 and opened_orders_count >= 0 and transferred_orders_count >= 0
  ),
  constraint employee_shifts_closed_cash_check check (status <> 'closed' or actual_cash_amount is not null),
  constraint employee_shifts_variance_comment_check check (
    coalesce(cash_variance, 0) = 0 or length(btrim(coalesce(cash_variance_comment, closing_comment, ''))) > 0
  ),
  constraint employee_shifts_force_reason_check check (status <> 'force_closed' or length(btrim(coalesce(force_close_reason, ''))) > 0)
);

create unique index if not exists employee_shifts_one_open_per_employee_idx
on public.employee_shifts (organization_id, employee_user_id)
where status in ('open', 'closing');
create index if not exists employee_shifts_organization_id_idx on public.employee_shifts (organization_id);
create index if not exists employee_shifts_operational_day_id_idx on public.employee_shifts (operational_day_id);
create index if not exists employee_shifts_employee_user_id_idx on public.employee_shifts (employee_user_id);
create index if not exists employee_shifts_organization_status_idx on public.employee_shifts (organization_id, status);
create index if not exists employee_shifts_organization_opened_at_idx on public.employee_shifts (organization_id, opened_at desc);
create index if not exists employee_shifts_template_id_idx on public.employee_shifts (shift_template_id);

create table if not exists public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  operational_day_id uuid not null references public.operational_days(id) on delete cascade,
  from_shift_id uuid not null references public.employee_shifts(id) on delete cascade,
  to_shift_id uuid references public.employee_shifts(id) on delete set null,
  status public.shift_handover_status not null default 'pending',
  opening_orders_count integer not null default 0,
  active_sessions_count integer not null default 0,
  expected_cash_handover numeric(14,2),
  actual_cash_handover numeric(14,2),
  comment text,
  created_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  constraint shift_handovers_counters_check check (opening_orders_count >= 0 and active_sessions_count >= 0),
  constraint shift_handovers_cash_check check (
    (expected_cash_handover is null or expected_cash_handover >= 0)
    and (actual_cash_handover is null or actual_cash_handover >= 0)
  )
);

create index if not exists shift_handovers_organization_id_idx on public.shift_handovers (organization_id);
create index if not exists shift_handovers_operational_day_id_idx on public.shift_handovers (operational_day_id);
create index if not exists shift_handovers_from_shift_id_idx on public.shift_handovers (from_shift_id);
create index if not exists shift_handovers_to_shift_id_idx on public.shift_handovers (to_shift_id);
create index if not exists shift_handovers_status_idx on public.shift_handovers (organization_id, status);

create table if not exists public.shift_handover_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  handover_id uuid not null references public.shift_handovers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  active_session_id uuid references public.timed_sessions(id) on delete set null,
  order_total_snapshot numeric(14,2) not null default 0,
  place_name_snapshot text,
  created_at timestamptz not null default now(),
  constraint shift_handover_orders_total_check check (order_total_snapshot >= 0)
);

create index if not exists shift_handover_orders_organization_id_idx on public.shift_handover_orders (organization_id);
create index if not exists shift_handover_orders_handover_id_idx on public.shift_handover_orders (handover_id);
create index if not exists shift_handover_orders_order_id_idx on public.shift_handover_orders (order_id);

create table if not exists public.organization_notification_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  telegram_enabled boolean not null default false,
  telegram_chat_id text,
  notify_shift_opened boolean not null default true,
  notify_shift_closed boolean not null default true,
  notify_daily_summary boolean not null default true,
  notify_cash_variance boolean not null default true,
  notify_payment_refused boolean not null default true,
  notify_adjustment_requests boolean not null default true,
  notify_low_stock boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.notification_type not null,
  status public.notification_outbox_status not null default 'pending',
  entity_type text,
  entity_id uuid,
  payload jsonb not null,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error text,
  deduplication_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_attempt_check check (attempt_count >= 0),
  constraint notification_outbox_entity_check check (entity_type is null or length(btrim(entity_type)) > 0)
);

create unique index if not exists notification_outbox_deduplication_key_idx
on public.notification_outbox (deduplication_key)
where deduplication_key is not null;
create index if not exists notification_outbox_organization_id_idx on public.notification_outbox (organization_id);
create index if not exists notification_outbox_status_next_attempt_idx on public.notification_outbox (status, next_attempt_at);
create index if not exists notification_outbox_entity_idx on public.notification_outbox (entity_type, entity_id);

alter table public.orders
  add column if not exists opened_shift_id uuid references public.employee_shifts(id) on delete set null,
  add column if not exists closed_shift_id uuid references public.employee_shifts(id) on delete set null;

alter table public.payments
  add column if not exists shift_id uuid references public.employee_shifts(id) on delete set null;

alter table public.timed_sessions
  add column if not exists started_shift_id uuid references public.employee_shifts(id) on delete set null,
  add column if not exists ended_shift_id uuid references public.employee_shifts(id) on delete set null;

alter table public.order_adjustment_requests
  add column if not exists shift_id uuid references public.employee_shifts(id) on delete set null;

alter table public.audit_logs
  add column if not exists shift_id uuid references public.employee_shifts(id) on delete set null;

create index if not exists orders_opened_shift_id_idx on public.orders (opened_shift_id);
create index if not exists orders_closed_shift_id_idx on public.orders (closed_shift_id);
create index if not exists payments_shift_id_idx on public.payments (shift_id);
create index if not exists timed_sessions_started_shift_id_idx on public.timed_sessions (started_shift_id);
create index if not exists timed_sessions_ended_shift_id_idx on public.timed_sessions (ended_shift_id);
create index if not exists order_adjustment_requests_shift_id_idx on public.order_adjustment_requests (shift_id);
create index if not exists audit_logs_shift_id_idx on public.audit_logs (shift_id);

create or replace function public.get_business_date(target_organization_id uuid, target_moment timestamptz default now())
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_timezone text;
  local_time time;
  local_date date;
begin
  select timezone into org_timezone from public.organizations where id = target_organization_id;
  if org_timezone is null then org_timezone := 'Asia/Baku'; end if;

  local_time := (target_moment at time zone org_timezone)::time;
  local_date := (target_moment at time zone org_timezone)::date;

  if local_time < time '06:00' then
    return local_date - 1;
  end if;

  return local_date;
end;
$$;

create or replace function public.current_employee_open_shift(target_organization_id uuid default null)
returns public.employee_shifts
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
begin
  select es.* into shift_row
  from public.employee_shifts es
  where es.employee_user_id = auth.uid()
    and es.status = 'open'
    and (target_organization_id is null or es.organization_id = target_organization_id)
  order by es.opened_at desc
  limit 1;

  return shift_row;
end;
$$;

create or replace function public.current_employee_open_shift_id(target_organization_id uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (public.current_employee_open_shift(target_organization_id)).id;
$$;

create or replace function public.require_shift_for_employee_action(target_organization_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_value public.app_role;
  shift_id uuid;
begin
  role_value := public.current_user_role();
  if role_value = 'employee' then
    shift_id := public.current_employee_open_shift_id(target_organization_id);
    if shift_id is null then
      raise exception 'Open shift is required for employee operations.';
    end if;
    return shift_id;
  end if;

  if role_value in ('organization_admin', 'platform_owner') then
    return null;
  end if;

  raise exception 'User cannot perform shift-protected operation.';
end;
$$;

create or replace function public.create_notification_outbox(
  target_organization_id uuid,
  target_type public.notification_type,
  target_entity_type text,
  target_entity_id uuid,
  target_payload jsonb,
  target_deduplication_key text default null
)
returns public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  outbox_row public.notification_outbox;
begin
  perform set_config('app.shift_write', '1', true);

  insert into public.notification_outbox (
    organization_id,
    type,
    entity_type,
    entity_id,
    payload,
    deduplication_key
  )
  values (
    target_organization_id,
    target_type,
    target_entity_type,
    target_entity_id,
    coalesce(target_payload, '{}'::jsonb),
    nullif(btrim(target_deduplication_key), '')
  )
  on conflict (deduplication_key) where deduplication_key is not null do update set
    updated_at = public.notification_outbox.updated_at
  returning * into outbox_row;

  return outbox_row;
end;
$$;

create or replace function public.log_audit(
  target_organization_id uuid,
  target_action text,
  target_entity_type text,
  target_entity_id uuid default null,
  target_metadata jsonb default '{}'::jsonb
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  log_row public.audit_logs;
begin
  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    shift_id
  )
  values (
    target_organization_id,
    auth.uid(),
    target_action,
    target_entity_type,
    target_entity_id,
    coalesce(target_metadata, '{}'::jsonb),
    public.current_employee_open_shift_id(target_organization_id)
  )
  returning * into log_row;

  return log_row;
end;
$$;

create or replace function public.prevent_shift_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Physical delete is not allowed for shift records.';
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  if current_setting('app.shift_write', true) <> '1' then
    raise exception 'Shift records can be changed only through shift RPC functions.';
  end if;

  return new;
end;
$$;

create or replace function public.attach_shift_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  role_value public.app_role;
  shift_id uuid;
begin
  role_value := public.current_user_role();

  if role_value = 'employee' then
    shift_id := public.current_employee_open_shift_id(new.organization_id);
    if shift_id is null then
      raise exception 'Open shift is required for employee operations.';
    end if;
  end if;

  if tg_table_name = 'orders' then
    if tg_op = 'INSERT' and new.opened_shift_id is null then
      new.opened_shift_id := shift_id;
    elsif tg_op = 'UPDATE' and new.status in ('paid', 'payment_refused', 'cancelled') and old.status is distinct from new.status and new.closed_shift_id is null then
      new.closed_shift_id := shift_id;
    end if;
  elsif tg_table_name = 'payments' then
    if tg_op = 'INSERT' and new.shift_id is null then
      new.shift_id := shift_id;
    end if;
  elsif tg_table_name = 'timed_sessions' then
    if tg_op = 'INSERT' and new.started_shift_id is null then
      new.started_shift_id := shift_id;
    elsif tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from new.status and new.ended_shift_id is null then
      new.ended_shift_id := shift_id;
    end if;
  elsif tg_table_name = 'order_adjustment_requests' then
    if tg_op = 'INSERT' and new.shift_id is null then
      new.shift_id := shift_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_shift_context on public.orders;
create trigger orders_shift_context before insert or update on public.orders
for each row execute function public.attach_shift_context();
drop trigger if exists payments_shift_context on public.payments;
create trigger payments_shift_context before insert on public.payments
for each row execute function public.attach_shift_context();
drop trigger if exists timed_sessions_shift_context on public.timed_sessions;
create trigger timed_sessions_shift_context before insert or update on public.timed_sessions
for each row execute function public.attach_shift_context();
drop trigger if exists order_adjustments_shift_context on public.order_adjustment_requests;
create trigger order_adjustments_shift_context before insert on public.order_adjustment_requests
for each row execute function public.attach_shift_context();

create or replace function public.assert_shift_template_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_organization_admin(new.organization_id) then
    raise exception 'Only organization admins can manage shift templates.';
  end if;

  if not exists (select 1 from public.organizations o where o.id = new.organization_id and o.status = 'active') then
    raise exception 'Organization is not active.';
  end if;

  return new;
end;
$$;

drop trigger if exists shift_templates_set_updated_at on public.shift_templates;
create trigger shift_templates_set_updated_at before update on public.shift_templates
for each row execute function public.set_updated_at();
drop trigger if exists operational_days_set_updated_at on public.operational_days;
create trigger operational_days_set_updated_at before update on public.operational_days
for each row execute function public.set_updated_at();
drop trigger if exists employee_shifts_set_updated_at on public.employee_shifts;
create trigger employee_shifts_set_updated_at before update on public.employee_shifts
for each row execute function public.set_updated_at();
drop trigger if exists notification_settings_set_updated_at on public.organization_notification_settings;
create trigger notification_settings_set_updated_at before update on public.organization_notification_settings
for each row execute function public.set_updated_at();
drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at before update on public.notification_outbox
for each row execute function public.set_updated_at();

drop trigger if exists shift_templates_write_guard on public.shift_templates;
create trigger shift_templates_write_guard before insert or update on public.shift_templates
for each row execute function public.assert_shift_template_write();
drop trigger if exists operational_days_direct_write_guard on public.operational_days;
create trigger operational_days_direct_write_guard before insert or update or delete on public.operational_days
for each row execute function public.prevent_shift_direct_write();
drop trigger if exists employee_shifts_direct_write_guard on public.employee_shifts;
create trigger employee_shifts_direct_write_guard before insert or update or delete on public.employee_shifts
for each row execute function public.prevent_shift_direct_write();
drop trigger if exists shift_handovers_direct_write_guard on public.shift_handovers;
create trigger shift_handovers_direct_write_guard before insert or update or delete on public.shift_handovers
for each row execute function public.prevent_shift_direct_write();
drop trigger if exists shift_handover_orders_direct_write_guard on public.shift_handover_orders;
create trigger shift_handover_orders_direct_write_guard before insert or update or delete on public.shift_handover_orders
for each row execute function public.prevent_shift_direct_write();
drop trigger if exists notification_outbox_direct_write_guard on public.notification_outbox;
create trigger notification_outbox_direct_write_guard before insert or update or delete on public.notification_outbox
for each row execute function public.prevent_shift_direct_write();

create or replace function public.get_or_create_operational_day(
  target_organization_id uuid,
  target_business_date date
)
returns public.operational_days
language plpgsql
security definer
set search_path = public
as $$
declare
  day_row public.operational_days;
begin
  perform set_config('app.shift_write', '1', true);

  insert into public.operational_days (organization_id, business_date)
  values (target_organization_id, target_business_date)
  on conflict (organization_id, business_date) do update set updated_at = public.operational_days.updated_at
  returning * into day_row;

  return day_row;
end;
$$;

create or replace function public.calculate_shift_summary(target_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
  cash_total numeric(14,2);
  card_total numeric(14,2);
  paid_total numeric(14,2);
  unpaid_total numeric(14,2);
  refused_total numeric(14,2);
  paid_count integer;
  refused_count integer;
  opened_count integer;
  open_count integer;
  active_sessions_count integer;
  completed_sessions_count integer;
  expected_cash numeric(14,2);
begin
  select * into shift_row from public.employee_shifts where id = target_shift_id;
  if shift_row.id is null then raise exception 'Shift was not found.'; end if;
  if not (public.is_organization_admin(shift_row.organization_id) or shift_row.employee_user_id = auth.uid()) then
    raise exception 'You do not have access to this shift.';
  end if;

  select
    coalesce(sum(case when p.method = 'cash' then p.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when p.method = 'card_transfer' then p.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(p.amount), 0)::numeric(14,2),
    count(*)::integer
  into cash_total, card_total, paid_total, paid_count
  from public.payments p
  where p.shift_id = shift_row.id
    and p.status = 'completed';

  select
    coalesce(sum(o.unpaid_amount), 0)::numeric(14,2),
    count(*)::integer
  into refused_total, refused_count
  from public.orders o
  where o.closed_shift_id = shift_row.id
    and o.status = 'payment_refused';

  select coalesce(sum(o.unpaid_amount), 0)::numeric(14,2)
  into unpaid_total
  from public.orders o
  where o.opened_shift_id = shift_row.id
    and o.status in ('open', 'waiting_payment');

  select count(*)::integer
  into opened_count
  from public.orders o
  where o.opened_shift_id = shift_row.id;

  select count(*)::integer
  into open_count
  from public.orders o
  where o.organization_id = shift_row.organization_id
    and o.status in ('open', 'waiting_payment');

  select count(*)::integer
  into active_sessions_count
  from public.timed_sessions ts
  where ts.organization_id = shift_row.organization_id
    and ts.status = 'active';

  select count(*)::integer
  into completed_sessions_count
  from public.timed_sessions ts
  where ts.ended_shift_id = shift_row.id
    and ts.status = 'completed';

  expected_cash := shift_row.opening_cash_amount + cash_total;

  return jsonb_build_object(
    'shift_id', shift_row.id,
    'organization_id', shift_row.organization_id,
    'operational_day_id', shift_row.operational_day_id,
    'employee_user_id', shift_row.employee_user_id,
    'status', shift_row.status,
    'opened_at', shift_row.opened_at,
    'closed_at', shift_row.closed_at,
    'duration_minutes', floor(extract(epoch from (coalesce(shift_row.closed_at, now()) - shift_row.opened_at)) / 60)::integer,
    'opening_cash_amount', shift_row.opening_cash_amount,
    'cash_sales_total', cash_total,
    'card_transfer_sales_total', card_total,
    'paid_orders_total', paid_total,
    'unpaid_orders_total', unpaid_total,
    'payment_refused_total', refused_total,
    'completed_orders_count', paid_count,
    'payment_refused_count', refused_count,
    'opened_orders_count', opened_count,
    'open_orders_count', open_count,
    'active_sessions_count', active_sessions_count,
    'completed_sessions_count', completed_sessions_count,
    'expected_cash_amount', expected_cash,
    'actual_cash_amount', shift_row.actual_cash_amount,
    'cash_variance', shift_row.cash_variance,
    'cash_variance_status', shift_row.cash_variance_status
  );
end;
$$;

create or replace function public.recalculate_operational_day(target_operational_day_id uuid)
returns public.operational_days
language plpgsql
security definer
set search_path = public
as $$
declare
  day_row public.operational_days;
begin
  select * into day_row from public.operational_days where id = target_operational_day_id for update;
  if day_row.id is null then raise exception 'Operational day was not found.'; end if;

  perform set_config('app.shift_write', '1', true);

  update public.operational_days od
  set
    total_revenue = coalesce((
      select sum(p.amount) from public.payments p where p.organization_id = od.organization_id and p.status = 'completed' and p.created_at::date between od.business_date - 1 and od.business_date + 2 and exists (
        select 1 from public.employee_shifts es where es.id = p.shift_id and es.operational_day_id = od.id
      )
    ), 0),
    cash_revenue = coalesce((
      select sum(p.amount) from public.payments p join public.employee_shifts es on es.id = p.shift_id where es.operational_day_id = od.id and p.status = 'completed' and p.method = 'cash'
    ), 0),
    card_transfer_revenue = coalesce((
      select sum(p.amount) from public.payments p join public.employee_shifts es on es.id = p.shift_id where es.operational_day_id = od.id and p.status = 'completed' and p.method = 'card_transfer'
    ), 0),
    unpaid_total = coalesce((
      select sum(o.unpaid_amount) from public.orders o where o.organization_id = od.organization_id and o.status in ('open', 'waiting_payment') and exists (
        select 1 from public.employee_shifts es where es.id = o.opened_shift_id and es.operational_day_id = od.id
      )
    ), 0),
    payment_refused_total = coalesce((
      select sum(o.unpaid_amount) from public.orders o where o.organization_id = od.organization_id and o.status = 'payment_refused' and exists (
        select 1 from public.employee_shifts es where es.id = o.closed_shift_id and es.operational_day_id = od.id
      )
    ), 0),
    total_orders = coalesce((
      select count(*) from public.orders o where exists (
        select 1 from public.employee_shifts es where es.id = o.opened_shift_id and es.operational_day_id = od.id
      )
    ), 0),
    paid_orders = coalesce((
      select count(*) from public.orders o where o.status = 'paid' and exists (
        select 1 from public.employee_shifts es where es.id = o.closed_shift_id and es.operational_day_id = od.id
      )
    ), 0),
    status = case
      when exists (select 1 from public.employee_shifts es where es.operational_day_id = od.id and es.status in ('open', 'closing')) then 'open'::public.operational_day_status
      else 'completed'::public.operational_day_status
    end,
    closed_at = case
      when exists (select 1 from public.employee_shifts es where es.operational_day_id = od.id and es.status in ('open', 'closing')) then null
      else coalesce(od.closed_at, now())
    end,
    updated_at = now()
  where od.id = target_operational_day_id
  returning * into day_row;

  if day_row.status = 'completed' then
    perform public.create_notification_outbox(
      day_row.organization_id,
      'daily_summary',
      'operational_day',
      day_row.id,
      to_jsonb(day_row),
      'daily_summary:' || day_row.id::text
    );
    perform public.log_audit(day_row.organization_id, 'operational_day.completed', 'operational_day', day_row.id, to_jsonb(day_row));
  end if;

  return day_row;
end;
$$;

create or replace function public.open_employee_shift(
  target_shift_template_id uuid default null,
  target_opening_cash_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_row public.organization_memberships;
  organization_row public.organizations;
  template_row public.shift_templates;
  day_row public.operational_days;
  shift_row public.employee_shifts;
  accepted_handover public.shift_handovers;
  business_date date;
  local_start timestamp;
  local_end timestamp;
begin
  if target_opening_cash_amount < 0 then raise exception 'Opening cash cannot be negative.'; end if;

  select om.* into membership_row
  from public.organization_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.profiles p on p.id = om.user_id
  where om.user_id = auth.uid()
    and om.role = 'employee'
    and om.is_active = true
    and o.status = 'active'
    and p.is_active = true
  order by om.created_at asc
  limit 1;

  if membership_row.id is null then raise exception 'Active employee membership is required to open shift.'; end if;

  select * into organization_row from public.organizations where id = membership_row.organization_id and status = 'active';
  if organization_row.id is null then raise exception 'Organization is not active.'; end if;

  if exists (
    select 1 from public.employee_shifts es
    where es.organization_id = membership_row.organization_id
      and es.employee_user_id = auth.uid()
      and es.status in ('open', 'closing')
  ) then
    raise exception 'Employee already has an open shift.';
  end if;

  if target_shift_template_id is not null then
    select * into template_row
    from public.shift_templates
    where id = target_shift_template_id
      and organization_id = membership_row.organization_id
      and is_active = true;
    if template_row.id is null then raise exception 'Shift template was not found or is inactive.'; end if;
  end if;

  business_date := public.get_business_date(membership_row.organization_id, now());
  day_row := public.get_or_create_operational_day(membership_row.organization_id, business_date);

  if template_row.id is not null then
    local_start := business_date::timestamp + template_row.start_time;
    local_end := business_date::timestamp + template_row.end_time;
    if template_row.crosses_midnight then
      local_end := local_end + interval '1 day';
    end if;
  end if;

  perform set_config('app.shift_write', '1', true);

  insert into public.employee_shifts (
    organization_id,
    operational_day_id,
    shift_template_id,
    employee_user_id,
    scheduled_start_at,
    scheduled_end_at,
    opening_cash_amount
  )
  values (
    membership_row.organization_id,
    day_row.id,
    template_row.id,
    auth.uid(),
    case when template_row.id is null then null else local_start at time zone organization_row.timezone end,
    case when template_row.id is null then null else local_end at time zone organization_row.timezone end,
    target_opening_cash_amount
  )
  returning * into shift_row;

  update public.shift_handovers
  set
    to_shift_id = shift_row.id,
    status = 'accepted',
    accepted_by = auth.uid(),
    accepted_at = now()
  where id = (
    select sh.id
    from public.shift_handovers sh
    where sh.organization_id = shift_row.organization_id
      and sh.operational_day_id = shift_row.operational_day_id
      and sh.status = 'pending'
    order by sh.created_at desc, sh.id desc
    limit 1
  )
  returning * into accepted_handover;

  perform public.log_audit(shift_row.organization_id, 'shift.opened', 'employee_shift', shift_row.id, jsonb_build_object('opening_cash_amount', target_opening_cash_amount));
  perform public.create_notification_outbox(
    shift_row.organization_id,
    'shift_opened',
    'employee_shift',
    shift_row.id,
    jsonb_build_object('shift', to_jsonb(shift_row), 'template', to_jsonb(template_row)),
    'shift_opened:' || shift_row.id::text
  );

  return jsonb_build_object(
    'shift', to_jsonb(shift_row),
    'operational_day', to_jsonb(day_row),
    'accepted_handover', to_jsonb(accepted_handover),
    'summary', public.calculate_shift_summary(shift_row.id)
  );
end;
$$;

create or replace function public.get_current_employee_shift()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
  day_row public.operational_days;
  template_row public.shift_templates;
begin
  shift_row := public.current_employee_open_shift(null);
  if shift_row.id is null then
    return null;
  end if;

  select * into day_row from public.operational_days where id = shift_row.operational_day_id;
  if shift_row.shift_template_id is not null then
    select * into template_row from public.shift_templates where id = shift_row.shift_template_id;
  end if;

  return jsonb_build_object(
    'shift', to_jsonb(shift_row),
    'operational_day', to_jsonb(day_row),
    'template', to_jsonb(template_row),
    'summary', public.calculate_shift_summary(shift_row.id),
    'accepted_handovers', coalesce((
      select jsonb_agg(to_jsonb(sh))
      from public.shift_handovers sh
      where sh.to_shift_id = shift_row.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.close_employee_shift(
  target_actual_cash_amount numeric,
  target_comment text default null,
  target_handover_cash_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
  summary jsonb;
  expected_cash numeric(14,2);
  variance numeric(14,2);
  variance_status public.cash_variance_status;
  open_orders_count integer;
  active_sessions_count integer;
  handover_row public.shift_handovers;
begin
  if target_actual_cash_amount < 0 then raise exception 'Actual cash cannot be negative.'; end if;

  select * into shift_row
  from public.employee_shifts
  where employee_user_id = auth.uid()
    and status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if shift_row.id is null then raise exception 'Open shift was not found.'; end if;

  summary := public.calculate_shift_summary(shift_row.id);
  expected_cash := (summary ->> 'expected_cash_amount')::numeric;
  variance := target_actual_cash_amount - expected_cash;
  variance_status := case
    when variance = 0 then 'balanced'::public.cash_variance_status
    when variance < 0 then 'shortage'::public.cash_variance_status
    else 'overage'::public.cash_variance_status
  end;

  if variance <> 0 and length(btrim(coalesce(target_comment, ''))) = 0 then
    raise exception 'Comment is required when cash variance is not zero.';
  end if;

  select count(*) into open_orders_count
  from public.orders
  where organization_id = shift_row.organization_id
    and status in ('open', 'waiting_payment');

  select count(*) into active_sessions_count
  from public.timed_sessions
  where organization_id = shift_row.organization_id
    and status = 'active';

  perform set_config('app.shift_write', '1', true);

  update public.employee_shifts
  set
    status = 'closed',
    closed_at = now(),
    expected_cash_amount = expected_cash,
    actual_cash_amount = target_actual_cash_amount,
    cash_variance = variance,
    cash_variance_status = variance_status,
    cash_variance_comment = case when variance <> 0 then target_comment else null end,
    cash_sales_total = (summary ->> 'cash_sales_total')::numeric,
    card_transfer_sales_total = (summary ->> 'card_transfer_sales_total')::numeric,
    paid_orders_total = (summary ->> 'paid_orders_total')::numeric,
    unpaid_orders_total = (summary ->> 'unpaid_orders_total')::numeric,
    payment_refused_total = (summary ->> 'payment_refused_total')::numeric,
    completed_orders_count = (summary ->> 'completed_orders_count')::integer,
    payment_refused_count = (summary ->> 'payment_refused_count')::integer,
    opened_orders_count = (summary ->> 'opened_orders_count')::integer,
    transferred_orders_count = open_orders_count,
    closing_comment = target_comment,
    updated_at = now()
  where id = shift_row.id
  returning * into shift_row;

  if open_orders_count > 0 or active_sessions_count > 0 then
    insert into public.shift_handovers (
      organization_id,
      operational_day_id,
      from_shift_id,
      opening_orders_count,
      active_sessions_count,
      expected_cash_handover,
      actual_cash_handover,
      comment,
      created_by
    )
    values (
      shift_row.organization_id,
      shift_row.operational_day_id,
      shift_row.id,
      open_orders_count,
      active_sessions_count,
      expected_cash,
      target_handover_cash_amount,
      target_comment,
      auth.uid()
    )
    returning * into handover_row;

    insert into public.shift_handover_orders (
      organization_id,
      handover_id,
      order_id,
      active_session_id,
      order_total_snapshot,
      place_name_snapshot
    )
    select
      shift_row.organization_id,
      handover_row.id,
      o.id,
      ts.id,
      o.total_amount,
      o.current_place_name_snapshot
    from public.orders o
    left join public.timed_sessions ts on ts.order_id = o.id and ts.status = 'active'
    where o.organization_id = shift_row.organization_id
      and o.status in ('open', 'waiting_payment');

    perform public.log_audit(shift_row.organization_id, 'shift.handover_created', 'shift_handover', handover_row.id, to_jsonb(handover_row));
  end if;

  summary := public.calculate_shift_summary(shift_row.id);

  perform public.log_audit(shift_row.organization_id, 'shift.closed', 'employee_shift', shift_row.id, summary);
  perform public.create_notification_outbox(
    shift_row.organization_id,
    'shift_closed',
    'employee_shift',
    shift_row.id,
    jsonb_build_object('shift', to_jsonb(shift_row), 'summary', summary, 'handover', to_jsonb(handover_row)),
    'shift_closed:' || shift_row.id::text
  );

  if variance_status = 'shortage' then
    perform public.create_notification_outbox(
      shift_row.organization_id,
      'cash_shortage',
      'employee_shift',
      shift_row.id,
      jsonb_build_object('shift', to_jsonb(shift_row), 'summary', summary),
      'cash_shortage:' || shift_row.id::text
    );
    perform public.log_audit(shift_row.organization_id, 'shift.cash_shortage', 'employee_shift', shift_row.id, summary);
  elsif variance_status = 'overage' then
    perform public.create_notification_outbox(
      shift_row.organization_id,
      'cash_overage',
      'employee_shift',
      shift_row.id,
      jsonb_build_object('shift', to_jsonb(shift_row), 'summary', summary),
      'cash_overage:' || shift_row.id::text
    );
    perform public.log_audit(shift_row.organization_id, 'shift.cash_overage', 'employee_shift', shift_row.id, summary);
  end if;

  perform public.recalculate_operational_day(shift_row.operational_day_id);

  return jsonb_build_object(
    'shift', to_jsonb(shift_row),
    'summary', summary,
    'handover', to_jsonb(handover_row)
  );
end;
$$;

create or replace function public.force_close_employee_shift(
  target_shift_id uuid,
  target_actual_cash_amount numeric default null,
  target_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
  summary jsonb;
  expected_cash numeric(14,2);
  actual_cash numeric(14,2);
  variance numeric(14,2);
  variance_status public.cash_variance_status;
begin
  if length(btrim(coalesce(target_reason, ''))) = 0 then raise exception 'Force close reason is required.'; end if;

  select * into shift_row from public.employee_shifts where id = target_shift_id for update;
  if shift_row.id is null then raise exception 'Shift was not found.'; end if;
  if not public.is_organization_admin(shift_row.organization_id) then raise exception 'Only organization admins can force close shifts.'; end if;
  if shift_row.employee_user_id = auth.uid() then raise exception 'Employee cannot force close own shift.'; end if;
  if shift_row.status not in ('open', 'closing') then raise exception 'Only open shifts can be force closed.'; end if;

  summary := public.calculate_shift_summary(shift_row.id);
  expected_cash := (summary ->> 'expected_cash_amount')::numeric;
  actual_cash := coalesce(target_actual_cash_amount, expected_cash);
  variance := actual_cash - expected_cash;
  variance_status := case
    when variance = 0 then 'balanced'::public.cash_variance_status
    when variance < 0 then 'shortage'::public.cash_variance_status
    else 'overage'::public.cash_variance_status
  end;

  perform set_config('app.shift_write', '1', true);

  update public.employee_shifts
  set
    status = 'force_closed',
    closed_at = now(),
    expected_cash_amount = expected_cash,
    actual_cash_amount = actual_cash,
    cash_variance = variance,
    cash_variance_status = variance_status,
    cash_variance_comment = target_reason,
    force_closed_by = auth.uid(),
    force_close_reason = target_reason,
    cash_sales_total = (summary ->> 'cash_sales_total')::numeric,
    card_transfer_sales_total = (summary ->> 'card_transfer_sales_total')::numeric,
    paid_orders_total = (summary ->> 'paid_orders_total')::numeric,
    unpaid_orders_total = (summary ->> 'unpaid_orders_total')::numeric,
    payment_refused_total = (summary ->> 'payment_refused_total')::numeric,
    completed_orders_count = (summary ->> 'completed_orders_count')::integer,
    payment_refused_count = (summary ->> 'payment_refused_count')::integer,
    opened_orders_count = (summary ->> 'opened_orders_count')::integer,
    updated_at = now()
  where id = shift_row.id
  returning * into shift_row;

  summary := public.calculate_shift_summary(shift_row.id);

  perform public.log_audit(shift_row.organization_id, 'shift.force_closed', 'employee_shift', shift_row.id, jsonb_build_object('reason', target_reason, 'summary', summary));
  perform public.create_notification_outbox(
    shift_row.organization_id,
    'shift_closed',
    'employee_shift',
    shift_row.id,
    jsonb_build_object('shift', to_jsonb(shift_row), 'summary', summary, 'force_closed', true),
    'shift_force_closed:' || shift_row.id::text
  );
  perform public.recalculate_operational_day(shift_row.operational_day_id);

  return jsonb_build_object('shift', to_jsonb(shift_row), 'summary', summary);
end;
$$;

create or replace function public.find_overdue_open_shifts()
returns setof public.employee_shifts
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() and not exists (
    select 1 from public.organization_memberships om
    where om.user_id = auth.uid()
      and om.role = 'organization_admin'
      and om.is_active = true
  ) then
    raise exception 'Only admins can inspect overdue shifts.';
  end if;

  return query
  select es.*
  from public.employee_shifts es
  left join public.shift_templates st on st.id = es.shift_template_id
  where es.status = 'open'
    and es.scheduled_end_at is not null
    and now() > es.scheduled_end_at + make_interval(mins => coalesce(st.late_close_grace_minutes, 15))
    and (public.is_platform_owner() or public.is_organization_admin(es.organization_id));
end;
$$;

create or replace function public.create_overdue_shift_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row public.employee_shifts;
  created_count integer := 0;
begin
  for shift_row in select * from public.find_overdue_open_shifts()
  loop
    perform public.create_notification_outbox(
      shift_row.organization_id,
      'shift_not_closed',
      'employee_shift',
      shift_row.id,
      jsonb_build_object('shift', to_jsonb(shift_row)),
      'shift_not_closed:' || shift_row.id::text || ':' || date_trunc('hour', now())::text
    );
    created_count := created_count + 1;
  end loop;

  return created_count;
end;
$$;

create or replace view public.employee_current_shift_view
with (security_barrier = true)
as
select
  es.id,
  es.organization_id,
  es.operational_day_id,
  od.business_date,
  es.shift_template_id,
  st.name as shift_template_name,
  es.employee_user_id,
  es.status,
  es.opened_at,
  es.scheduled_start_at,
  es.scheduled_end_at,
  es.closed_at,
  es.opening_cash_amount,
  es.expected_cash_amount,
  es.actual_cash_amount,
  es.cash_variance,
  es.cash_variance_status,
  es.cash_sales_total,
  es.card_transfer_sales_total,
  es.paid_orders_total,
  es.unpaid_orders_total,
  es.payment_refused_total,
  es.completed_orders_count,
  es.payment_refused_count,
  es.opened_orders_count,
  es.transferred_orders_count,
  es.created_at,
  es.updated_at
from public.employee_shifts es
join public.operational_days od on od.id = es.operational_day_id
left join public.shift_templates st on st.id = es.shift_template_id
where es.employee_user_id = auth.uid()
  and public.is_organization_member(es.organization_id);

create or replace view public.admin_shift_reports
with (security_barrier = true)
as
select
  es.*,
  od.business_date,
  st.name as shift_template_name,
  p.email as employee_email,
  p.full_name as employee_full_name
from public.employee_shifts es
join public.operational_days od on od.id = es.operational_day_id
left join public.shift_templates st on st.id = es.shift_template_id
left join public.profiles p on p.id = es.employee_user_id
where public.is_organization_admin(es.organization_id);

create or replace view public.admin_operational_day_reports
with (security_barrier = true)
as
select
  od.*,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', es.id,
      'employee_user_id', es.employee_user_id,
      'status', es.status,
      'opened_at', es.opened_at,
      'closed_at', es.closed_at,
      'cash_sales_total', es.cash_sales_total,
      'card_transfer_sales_total', es.card_transfer_sales_total,
      'cash_variance', es.cash_variance,
      'cash_variance_status', es.cash_variance_status
    ) order by es.opened_at)
    from public.employee_shifts es
    where es.operational_day_id = od.id
  ), '[]'::jsonb) as shifts
from public.operational_days od
where public.is_organization_admin(od.organization_id);

alter table public.shift_templates enable row level security;
alter table public.operational_days enable row level security;
alter table public.employee_shifts enable row level security;
alter table public.shift_handovers enable row level security;
alter table public.shift_handover_orders enable row level security;
alter table public.organization_notification_settings enable row level security;
alter table public.notification_outbox enable row level security;

drop policy if exists "Shift templates readable by organization members" on public.shift_templates;
create policy "Shift templates readable by organization members"
on public.shift_templates for select to authenticated
using (public.is_organization_member(organization_id));
drop policy if exists "Shift templates insertable by organization admins" on public.shift_templates;
create policy "Shift templates insertable by organization admins"
on public.shift_templates for insert to authenticated
with check (public.is_organization_admin(organization_id));
drop policy if exists "Shift templates updatable by organization admins" on public.shift_templates;
create policy "Shift templates updatable by organization admins"
on public.shift_templates for update to authenticated
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

drop policy if exists "Operational days readable by organization admins" on public.operational_days;
create policy "Operational days readable by organization admins"
on public.operational_days for select to authenticated
using (public.is_organization_admin(organization_id));

drop policy if exists "Employee shifts readable by owner or admins" on public.employee_shifts;
create policy "Employee shifts readable by owner or admins"
on public.employee_shifts for select to authenticated
using (public.is_organization_admin(organization_id) or employee_user_id = auth.uid());

drop policy if exists "Shift handovers readable by organization admins" on public.shift_handovers;
create policy "Shift handovers readable by organization admins"
on public.shift_handovers for select to authenticated
using (public.is_organization_admin(organization_id));
drop policy if exists "Shift handover orders readable by organization admins" on public.shift_handover_orders;
create policy "Shift handover orders readable by organization admins"
on public.shift_handover_orders for select to authenticated
using (public.is_organization_admin(organization_id));

drop policy if exists "Notification settings readable by organization admins" on public.organization_notification_settings;
create policy "Notification settings readable by organization admins"
on public.organization_notification_settings for select to authenticated
using (public.is_organization_admin(organization_id));
drop policy if exists "Notification settings insertable by organization admins" on public.organization_notification_settings;
create policy "Notification settings insertable by organization admins"
on public.organization_notification_settings for insert to authenticated
with check (public.is_organization_admin(organization_id));
drop policy if exists "Notification settings updatable by organization admins" on public.organization_notification_settings;
create policy "Notification settings updatable by organization admins"
on public.organization_notification_settings for update to authenticated
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

drop policy if exists "Notification outbox readable by organization admins" on public.notification_outbox;
create policy "Notification outbox readable by organization admins"
on public.notification_outbox for select to authenticated
using (public.is_organization_admin(organization_id));

grant select on public.employee_current_shift_view to authenticated;
grant select on public.admin_shift_reports to authenticated;
grant select on public.admin_operational_day_reports to authenticated;
grant execute on function public.get_business_date(uuid, timestamptz) to authenticated;
grant execute on function public.current_employee_open_shift(uuid) to authenticated;
grant execute on function public.current_employee_open_shift_id(uuid) to authenticated;
grant execute on function public.open_employee_shift(uuid, numeric) to authenticated;
grant execute on function public.get_current_employee_shift() to authenticated;
grant execute on function public.calculate_shift_summary(uuid) to authenticated;
grant execute on function public.close_employee_shift(numeric, text, numeric) to authenticated;
grant execute on function public.force_close_employee_shift(uuid, numeric, text) to authenticated;
grant execute on function public.find_overdue_open_shifts() to authenticated;
grant execute on function public.create_overdue_shift_notifications() to authenticated;
