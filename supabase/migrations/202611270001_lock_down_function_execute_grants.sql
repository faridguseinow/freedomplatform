-- Security: stop exposing internal SECURITY DEFINER functions through /rpc.
--
-- Earlier migrations used `revoke all ... from public`, but Supabase also grants
-- EXECUTE directly to anon/authenticated, so those revokes had no effect and
-- the Supabase security advisor reports 136 functions callable with the public
-- anon key. Some internal helpers have no permission check of their own
-- (close_demo_runtime, create_notification_outbox, finance_log,
-- consume_order_stock, ...).
--
-- This migration keeps the current effective rights of `authenticated` and
-- `service_role`, removes EXECUTE from PUBLIC and anon, and then closes the
-- internal helpers for `authenticated` too. Helpers are only called from other
-- SECURITY DEFINER functions (run as the owner) or from triggers (EXECUTE is
-- not checked when a trigger fires), so app behaviour does not change.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      -- leave functions that belong to extensions alone
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    -- 1. Make today's effective rights explicit before PUBLIC is revoked.
    if has_function_privilege('authenticated', fn.oid, 'EXECUTE') then
      execute format('grant execute on function %s to authenticated', fn.signature);
    end if;
    if has_function_privilege('service_role', fn.oid, 'EXECUTE') then
      execute format('grant execute on function %s to service_role', fn.signature);
    end if;

    -- 2. Nothing in public is callable anonymously by default.
    execute format('revoke execute on function %s from public, anon', fn.signature);
  end loop;
end;
$$;

-- 3. Functions the login screen needs before the user is signed in.
grant execute on function public.resolve_organization_host(text) to anon;
grant execute on function public.resolve_organization_login(text) to anon;

-- 4. Internal helpers: not called by the web app, only by other SECURITY DEFINER
--    functions, triggers, cron or Edge Functions (service_role).
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
        -- no permission check inside
        'close_demo_runtime',
        'create_notification_outbox',
        'create_overdue_shift_notifications',
        'finance_log',
        'consume_order_stock',
        'allocate_completed_payment_to_items',
        'release_order_item_reservations',
        'recalculate_operational_day',
        'get_or_create_operational_day',
        'seed_standard_finance_categories',
        'sync_order_income',
        -- service_role only (checked inside, closed here as defence in depth)
        'provision_fixed_demo_membership',
        'consolidate_demo_anonymous_users',
        'consolidate_demo_anonymous_users_safe',
        'consolidate_demo_anonymous_users_strict',
        -- trigger / event trigger functions
        'handle_new_user',
        'audit_place_admin_changes',
        'protect_paid_order_item',
        'rls_auto_enable'
      ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$$;

-- 5. New functions must not become anonymously callable again by default.
--    The PUBLIC grant is built in and can only be removed globally (a per-schema
--    rule cannot take it away). authenticated / service_role keep their
--    Supabase per-schema defaults. A function that must work before sign-in
--    needs an explicit "grant execute ... to anon".
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
