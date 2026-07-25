# Multi-Tenant Foundation

Freedom Platform uses Supabase Auth for identity and separate application tables for access.

## Tables

- `public.profiles`: personal user data only.
- `public.platform_user_roles`: global platform roles. Only `platform_owner` is allowed here.
- `public.organizations`: tenant organizations.
- `public.organization_memberships`: organization-level access with `organization_admin` or `employee`.

`profiles.role` and `profiles.organization_id` are no longer used by the frontend. Existing values are migrated into `platform_user_roles` and `organization_memberships`, then the legacy columns are dropped.

## Roles

- `platform_owner`: global Freedom Platform owner. Can manage all organizations.
- `organization_admin`: admin inside one or more organizations.
- `employee`: employee inside one or more organizations.

A user may belong to multiple organizations. The current frontend selects the first active membership, preferring `organization_admin`.

## First Platform Owner

Create the Auth user in Supabase Dashboard first. Then insert the platform role manually in SQL Editor:

```sql
insert into public.platform_user_roles (user_id, role, created_by)
values (
  'AUTH_USER_UUID',
  'platform_owner',
  null
)
on conflict (user_id) do nothing;
```

Do not create the first platform owner from frontend. Do not put real UUIDs, emails, or passwords into migrations or seed files.

Previously used test passwords must be changed in Supabase Authentication.

## Create The Liga

After the platform owner exists, create the organization with RPC:

```sql
select *
from public.create_organization_with_admin(
  name := 'The Liga',
  slug := 'the-liga',
  description := 'Main operating organization.',
  logo_path := null,
  default_locale := 'ru',
  timezone := 'Asia/Baku',
  currency_code := 'AZN',
  admin_user_id := 'ADMIN_AUTH_USER_UUID'
);
```

If the admin user is not ready yet, pass `admin_user_id := null` and assign later:

```sql
select *
from public.assign_organization_admin(
  target_organization_id := 'ORGANIZATION_UUID',
  target_user_id := 'ADMIN_AUTH_USER_UUID'
);
```

## RLS Summary

- Users can read and update their own profile.
- Platform owners can read all profiles, organizations, platform roles, and memberships.
- Organization admins can read memberships and profiles inside their active organization.
- Employees can read only their own memberships and profile.
- Organization admins cannot create another `organization_admin` and cannot assign `platform_owner`.
- Frontend does not physically delete organizations or memberships.
- Archived and suspended organizations are excluded from active work access.

Helper functions use `auth.uid()` and avoid accepting frontend `user_id` where it is not needed.

## RLS Checks

Use two separate Auth users:

1. Sign in as platform owner and confirm all organizations are visible.
2. Sign in as organization admin and confirm only the assigned organization is visible.
3. Create or assign an employee and confirm they cannot update memberships.
4. Archive an organization and confirm admin/employee access is blocked.
5. Confirm frontend `.env.local` contains only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Storage

Bucket: `organization-assets`.

Logo path convention:

```text
organizations/{organization_id}/logo.webp
```

Platform owners can upload for all organizations. Organization admins can upload only for their own organization. Employees cannot upload.

## Development Rollback

In development only, reset the local Supabase database or manually drop the new objects in reverse dependency order. Do not run destructive SQL against production without a backup and explicit approval.

## Next Stage

Recommended next step:

1. Add employee invite flow through an Edge Function.
2. Implement `/admin/employees` on top of `organization_memberships`.
3. Add organization settings editing for admins.
4. Add shifts only after memberships and organization context are stable.
