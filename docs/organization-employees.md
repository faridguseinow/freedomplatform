# Organization Employees

The employee module is built on the existing multi-tenant access model:

```text
auth.users -> profiles -> organization_memberships
```

There is no separate `employees` table. This avoids duplicating names, emails, avatar paths, and locale preferences.

## Stored Data

`profiles` stores personal data:

- `full_name`
- `email`
- `avatar_path`
- `preferred_locale`
- `is_active`

`organization_memberships` stores organization access and employee-specific metadata:

- `role`
- `job_title`
- `phone`
- `notes`
- `is_active`
- `sort_order`
- `deactivated_at`

Passwords and PIN codes are not stored in application tables.

## Manual Auth User Creation

In this version, Auth users are created manually:

1. Open Supabase Dashboard.
2. Go to `Authentication -> Users`.
3. Create a user with email and password.
4. Confirm that a `profiles` row exists.
5. Add the user from `/admin/employees` by exact email.

Later this will be replaced by an Edge Function invitation flow.

## RPC

The admin frontend does not use `service_role`.

RPC functions:

- `find_available_user_by_email(target_email, target_organization_id)`
- `assign_organization_employee(target_organization_id, target_user_id, target_full_name, target_job_title, target_phone, target_notes)`
- `update_organization_employee(target_membership_id, target_full_name, target_job_title, target_phone, target_notes, target_sort_order)`
- `set_organization_employee_active(target_membership_id, target_is_active)`

The functions validate the current `auth.uid()` against active organization admin access. They also reject platform owners and non-employee role changes.

## Access Rules

Organization admin can:

- read employees of the current organization;
- find an existing Auth user by exact email;
- add the user as `employee`;
- edit employee `full_name`, `job_title`, `phone`, `notes`, and `sort_order`;
- deactivate or reactivate employee access.

Organization admin cannot:

- create Auth users from frontend;
- assign `platform_owner`;
- assign `organization_admin`;
- change `organization_id`, `user_id`, `role`, or `created_by`;
- physically delete memberships;
- manage employees of another organization.

Employee can:

- read own profile;
- read own membership.

Employee cannot:

- list organization employees;
- add employees;
- edit memberships.

## Deactivation

Disabling an employee sets:

```text
is_active = false
deactivated_at = now()
```

Reactivation sets:

```text
is_active = true
deactivated_at = null
```

The record remains for history. Frontend does not physically delete memberships.

## Current Limitations

- No invitations yet.
- No salary, shifts, schedules, orders, audit log, or PIN codes.
- Auth user creation is manual in Supabase Dashboard.
- Employee search is exact email only to avoid exposing the user base.

## Manual Test Flow

1. Apply `202607230003_organization_employees.sql`.
2. Sign in as `organization_admin`.
3. Open `/admin/employees`.
4. Create a test Auth user in Supabase Dashboard.
5. Search the exact email in the add employee modal.
6. Add job title, phone, and notes.
7. Save and confirm the employee appears.
8. Edit job title and phone.
9. Disable employee access.
10. Try signing in as that employee and confirm access is blocked.
11. Reactivate access and confirm the employee can enter `/employee`.

## Next Step

After this module, the next recommended stage is organization setup: places, tables, rooms, products, and services.
