-- Turn on authenticator app (TOTP) sign-in for The Liga.
--
-- Apply only after the frontend with the authenticator screens is deployed.
-- From this moment every The Liga admin and employee is asked to connect an
-- authenticator app on the next sign-in, and organization data is available
-- only to sessions that passed the second factor (aal2).
--
-- The existing organizations_restricted_update trigger rejects updates made
-- without a signed-in user (SQL editor, migrations), so it is switched off
-- only for this single statement, inside the migration transaction.
--
-- Rollback (instant, no data loss): run the same block with
--   set mfa_required = false

alter table public.organizations disable trigger organizations_restricted_update;

update public.organizations
set mfa_required = true
where slug = 'theliga'
  and mfa_required = false;

alter table public.organizations enable trigger organizations_restricted_update;
