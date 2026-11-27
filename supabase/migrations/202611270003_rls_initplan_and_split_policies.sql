-- Performance: RLS policies evaluated once per statement instead of once per row.
--
-- * auth.uid() / is_platform_owner() are wrapped in (select ...) so Postgres
--   runs them once as an InitPlan (advisor lint 0003_auth_rls_initplan).
-- * "... writable ..." policies were FOR ALL and so also applied to SELECT,
--   doubling the policy work on every read (lint 0006). They are split into
--   INSERT / UPDATE / DELETE with the same conditions.
-- Access rules are unchanged.

-- profiles ---------------------------------------------------------------
drop policy if exists "Profiles are readable by allowed users" on public.profiles;
create policy "Profiles are readable by allowed users"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_platform_owner())
  or exists (
    select 1
    from public.organization_memberships own_membership
    join public.organization_memberships target_membership
      on target_membership.organization_id = own_membership.organization_id
    join public.organizations o on o.id = own_membership.organization_id
    where own_membership.user_id = (select auth.uid())
      and own_membership.role = 'organization_admin'
      and own_membership.is_active = true
      and target_membership.user_id = profiles.id
      and target_membership.is_active = true
      and o.status = 'active'
  )
);

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Platform owners can update profiles" on public.profiles;
drop policy if exists "Profiles are updatable by owner or platform owners" on public.profiles;
create policy "Profiles are updatable by owner or platform owners"
on public.profiles
for update
to authenticated
using (
  (select public.is_platform_owner())
  or (id = (select auth.uid()) and is_active = true)
)
with check (
  (select public.is_platform_owner())
  or id = (select auth.uid())
);

-- organizations ----------------------------------------------------------
drop policy if exists "Platform owners can insert organizations" on public.organizations;
create policy "Platform owners can insert organizations"
on public.organizations
for insert
to authenticated
with check ((select public.is_platform_owner()) and created_by = (select auth.uid()));

-- platform_user_roles ----------------------------------------------------
drop policy if exists "Platform owners can read platform roles" on public.platform_user_roles;
create policy "Platform owners can read platform roles"
on public.platform_user_roles
for select
to authenticated
using ((select public.is_platform_owner()) or user_id = (select auth.uid()));

-- organization_memberships -----------------------------------------------
drop policy if exists "Memberships are readable by access context" on public.organization_memberships;
create policy "Memberships are readable by access context"
on public.organization_memberships
for select
to authenticated
using (
  (select public.is_platform_owner())
  or user_id = (select auth.uid())
  or public.is_organization_admin(organization_id)
);

-- employee_shifts --------------------------------------------------------
drop policy if exists "Employee shifts readable by owner or admins" on public.employee_shifts;
create policy "Employee shifts readable by owner or admins"
on public.employee_shifts for select to authenticated
using (employee_user_id = (select auth.uid()) or public.is_organization_admin(organization_id));

-- finance_audit_logs ----------------------------------------------------
drop policy if exists "Finance audit readable by finance roles" on public.finance_audit_logs;
create policy "Finance audit readable by finance roles"
on public.finance_audit_logs for select to authenticated
using ((select public.is_platform_owner()) or (organization_id is not null and public.is_organization_admin(organization_id)));

drop policy if exists "Finance audit writable through RPC" on public.finance_audit_logs;
drop policy if exists "Finance audit insert by finance roles" on public.finance_audit_logs;
create policy "Finance audit insert by finance roles"
on public.finance_audit_logs for insert to authenticated
with check ((select public.is_platform_owner()) or (organization_id is not null and public.is_organization_admin(organization_id)));

drop policy if exists "Finance audit update by finance roles" on public.finance_audit_logs;
create policy "Finance audit update by finance roles"
on public.finance_audit_logs for update to authenticated
using ((select public.is_platform_owner()) or (organization_id is not null and public.is_organization_admin(organization_id)))
with check ((select public.is_platform_owner()) or (organization_id is not null and public.is_organization_admin(organization_id)));

drop policy if exists "Finance audit delete by finance roles" on public.finance_audit_logs;
create policy "Finance audit delete by finance roles"
on public.finance_audit_logs for delete to authenticated
using ((select public.is_platform_owner()) or (organization_id is not null and public.is_organization_admin(organization_id)));

-- finance_categories ----------------------------------------------------
drop policy if exists "Finance categories readable by finance roles" on public.finance_categories;
create policy "Finance categories readable by finance roles"
on public.finance_categories for select to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Finance categories writable by organization admins" on public.finance_categories;
drop policy if exists "Finance categories insert by finance roles" on public.finance_categories;
create policy "Finance categories insert by finance roles"
on public.finance_categories for insert to authenticated
with check (public.is_organization_admin(organization_id));

drop policy if exists "Finance categories update by finance roles" on public.finance_categories;
create policy "Finance categories update by finance roles"
on public.finance_categories for update to authenticated
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

drop policy if exists "Finance categories delete by finance roles" on public.finance_categories;
create policy "Finance categories delete by finance roles"
on public.finance_categories for delete to authenticated
using (public.is_organization_admin(organization_id));

-- finance_transactions --------------------------------------------------
drop policy if exists "Finance transactions readable by finance roles" on public.finance_transactions;
create policy "Finance transactions readable by finance roles"
on public.finance_transactions for select to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Finance transactions writable by finance roles through RPC" on public.finance_transactions;
drop policy if exists "Finance transactions insert by finance roles" on public.finance_transactions;
create policy "Finance transactions insert by finance roles"
on public.finance_transactions for insert to authenticated
with check ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Finance transactions update by finance roles" on public.finance_transactions;
create policy "Finance transactions update by finance roles"
on public.finance_transactions for update to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id))
with check ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Finance transactions delete by finance roles" on public.finance_transactions;
create policy "Finance transactions delete by finance roles"
on public.finance_transactions for delete to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

-- financial_periods -----------------------------------------------------
drop policy if exists "Financial periods readable by finance roles" on public.financial_periods;
create policy "Financial periods readable by finance roles"
on public.financial_periods for select to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Financial periods writable by finance roles through RPC" on public.financial_periods;
drop policy if exists "Financial periods insert by finance roles" on public.financial_periods;
create policy "Financial periods insert by finance roles"
on public.financial_periods for insert to authenticated
with check ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Financial periods update by finance roles" on public.financial_periods;
create policy "Financial periods update by finance roles"
on public.financial_periods for update to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id))
with check ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Financial periods delete by finance roles" on public.financial_periods;
create policy "Financial periods delete by finance roles"
on public.financial_periods for delete to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

-- organization_finance_settings -----------------------------------------
drop policy if exists "Finance settings readable by finance roles" on public.organization_finance_settings;
create policy "Finance settings readable by finance roles"
on public.organization_finance_settings for select to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Finance settings writable by finance roles" on public.organization_finance_settings;
drop policy if exists "Finance settings insert by finance roles" on public.organization_finance_settings;
create policy "Finance settings insert by finance roles"
on public.organization_finance_settings for insert to authenticated
with check ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Finance settings update by finance roles" on public.organization_finance_settings;
create policy "Finance settings update by finance roles"
on public.organization_finance_settings for update to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id))
with check ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Finance settings delete by finance roles" on public.organization_finance_settings;
create policy "Finance settings delete by finance roles"
on public.organization_finance_settings for delete to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

-- platform_share_payments -----------------------------------------------
drop policy if exists "Platform share payments readable by finance roles" on public.platform_share_payments;
create policy "Platform share payments readable by finance roles"
on public.platform_share_payments for select to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Platform share payments writable by finance roles through RPC" on public.platform_share_payments;
drop policy if exists "Platform share payments insert by finance roles" on public.platform_share_payments;
create policy "Platform share payments insert by finance roles"
on public.platform_share_payments for insert to authenticated
with check ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Platform share payments update by finance roles" on public.platform_share_payments;
create policy "Platform share payments update by finance roles"
on public.platform_share_payments for update to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id))
with check ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Platform share payments delete by finance roles" on public.platform_share_payments;
create policy "Platform share payments delete by finance roles"
on public.platform_share_payments for delete to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

-- recurring_expenses ----------------------------------------------------
drop policy if exists "Recurring expenses readable by organization admins" on public.recurring_expenses;
create policy "Recurring expenses readable by organization admins"
on public.recurring_expenses for select to authenticated
using ((select public.is_platform_owner()) or public.is_organization_admin(organization_id));

drop policy if exists "Recurring expenses writable by organization admins" on public.recurring_expenses;
drop policy if exists "Recurring expenses insert by finance roles" on public.recurring_expenses;
create policy "Recurring expenses insert by finance roles"
on public.recurring_expenses for insert to authenticated
with check (public.is_organization_admin(organization_id));

drop policy if exists "Recurring expenses update by finance roles" on public.recurring_expenses;
create policy "Recurring expenses update by finance roles"
on public.recurring_expenses for update to authenticated
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

drop policy if exists "Recurring expenses delete by finance roles" on public.recurring_expenses;
create policy "Recurring expenses delete by finance roles"
on public.recurring_expenses for delete to authenticated
using (public.is_organization_admin(organization_id));
