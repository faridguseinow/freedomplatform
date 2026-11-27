-- Turn on authenticator app (TOTP) sign-in for The Liga.
--
-- Apply only after the frontend with the authenticator screens is deployed.
-- From this moment every The Liga admin and employee is asked to connect an
-- authenticator app on the next sign-in, and organization data is available
-- only to sessions that passed the second factor (aal2).
--
-- Rollback (instant, no data loss):
--   update public.organizations set mfa_required = false where slug = 'theliga';

update public.organizations
set mfa_required = true
where slug = 'theliga'
  and mfa_required = false;
