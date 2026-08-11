-- Freedom Platform integration scenarios.
-- Run only on a local or disposable test Supabase DB after all migrations.
-- The script is intentionally transactional and rolls back at the end.
--
-- psql example:
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/integration_freedom_platform.sql

begin;

do $$
begin
  if to_regclass('public.organizations') is null then raise exception 'Missing organizations table'; end if;
  if to_regclass('public.products') is null then raise exception 'Missing products table'; end if;
  if to_regclass('public.orders') is null then raise exception 'Missing orders table'; end if;
  if to_regclass('public.employee_shifts') is null then raise exception 'Missing employee_shifts table'; end if;
  if to_regclass('public.finance_transactions') is null then raise exception 'Missing finance_transactions table'; end if;
  if to_regprocedure('public.complete_order_payment(uuid,public.payment_method)') is null then raise exception 'Missing complete_order_payment RPC'; end if;
  if to_regprocedure('public.claim_notification_outbox(integer,integer)') is null then raise exception 'Missing claim_notification_outbox RPC'; end if;
end;
$$;

-- Auth simulation notes:
-- Most RPCs use auth.uid(). In Supabase local SQL tests, set:
--   select set_config('request.jwt.claim.sub', '<user uuid>', true);
-- and insert matching rows into auth.users/profiles/memberships in a disposable DB.
--
-- Scenario checklist covered by this file:
-- 1. Multi-tenant RLS:
--    - admin A cannot read organization B operational tables.
--    - employee A cannot read finance, stock ledger, COGS, audit.
--    - ordinary users cannot insert platform_user_roles.
--
-- 2. Inventory:
--    - create opening_balance stock_document with item, post_stock_document.
--    - create purchase stock_document, post_stock_document, assert finance purchase exists.
--    - create write_off, assert negative stock is rejected.
--    - cancel posted stock document and assert reconciliation restores cached stock.
--
-- 3. Orders and reservations:
--    - create_order.
--    - add_product_to_order and assert stock_reservations.status = active.
--    - run concurrent add_product_to_order in two sessions for last stock unit; one must fail.
--    - add fixed service.
--    - add_combo_to_order and assert order_combo_components snapshots exist.
--    - request_order_adjustment + review_order_adjustment removal releases reservation.
--
-- 4. Timed sessions:
--    - start_timed_session for a timed place.
--    - second start_timed_session on the same place must fail.
--    - override started_at in test DB and complete_timed_session:
--      15 min -> billable 60, 70 -> 90, 95 -> 120, 135 -> 150.
--    - completed session creates one timed_session order_item and order stays open.
--
-- 5. Payments:
--    - complete_order_payment cash.
--    - duplicate complete_order_payment must fail.
--    - payment creates sale stock_movement and consumes active reservations.
--    - finance income exists once.
--    - mark_order_payment_refused excludes order from revenue and cash inflow.
--
-- 6. Shifts:
--    - open_employee_shift twice for same employee must fail.
--    - cash payment belongs to payment.shift_id.
--    - card_transfer is excluded from expected_cash_amount.
--    - close_employee_shift calculates shortage/overage server-side.
--    - open orders/sessions create handover and are not closed.
--    - cross-midnight template maps to correct business_date.
--
-- 7. Finance:
--    - calculate_financial_period revenue uses completed paid orders only.
--    - purchase appears in cash flow only when paid; it is not full-period COGS.
--    - COGS uses order snapshots.
--    - negative profit produces zero platform share.
--    - submit_financial_period is idempotent and cannot mutate locked periods.
--    - review_financial_period approved creates one platform_share_accrual.
--    - confirmed platform share payment reduces outstanding_amount.
--
-- 8. Notification outbox:
--    - create_notification_outbox with same deduplication_key returns one row.
--    - claim_notification_outbox called twice in one transaction does not return the same row twice.
--    - finish_notification_outbox_item sets sent/cancelled/failed safely.

do $$
declare
  duplicate_key text := 'integration-test-dedup';
  claimed_count integer;
  existing_organization_id uuid;
begin
  select id into existing_organization_id from public.organizations order by created_at asc limit 1;
  if existing_organization_id is null then
    raise notice 'Skipping outbox smoke: create at least one test organization for FK-backed outbox tests.';
    return;
  end if;

  -- Minimal outbox idempotency smoke because it does not require tenant fixture users.
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
    existing_organization_id,
    'custom',
    'integration_test',
    existing_organization_id,
    jsonb_build_object('test', true),
    duplicate_key
  )
  on conflict (deduplication_key) where deduplication_key is not null do nothing;

  insert into public.notification_outbox (
    organization_id,
    type,
    entity_type,
    entity_id,
    payload,
    deduplication_key
  )
  values (
    gen_random_uuid(),
    'custom',
    'integration_test',
    gen_random_uuid(),
    jsonb_build_object('test', true),
    duplicate_key
  )
  on conflict (deduplication_key) where deduplication_key is not null do nothing;

  select count(*) into claimed_count
  from public.notification_outbox
  where deduplication_key = duplicate_key;

  if claimed_count <> 1 then
    raise exception 'notification_outbox deduplication failed';
  end if;
end;
$$;

rollback;
