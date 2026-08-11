# Reset And Seed The Liga AZ

This is a destructive initialization flow for the linked Supabase project.

It deletes tenant organization data by truncating `public.organizations` with `CASCADE`, then recreates `The Liga` in Azerbaijani.

Preserved data:

- `auth.users`
- `public.profiles`
- `public.platform_user_roles`
- `supabase_migrations.schema_migrations`
- storage buckets and storage object metadata

Created data:

- Organization `The Liga`, slug `the-liga`
- Organization admin membership for `249f97ea-f12a-43a7-bb52-5f08bfc2c7ec`
- Azerbaijani place categories, timed places, normal tables, hourly services
- Two shift templates: `Birinci növbə`, `İkinci növbə`
- Notification settings with Telegram disabled and all notification flags enabled
- Finance settings and Azerbaijani finance categories

Products are intentionally not invented. Exact product data was not found in the repository, so the placeholder file is:

```text
supabase/seeds/the_liga_products_pending.json
```

## Requirements

The repo must be initialized and linked:

```bash
supabase init
supabase link --project-ref arcstfcdnezmhvvsafop
```

Required local tool:

- Supabase CLI

Required environment variable:

```bash
export SUPABASE_DB_PASSWORD='...'
```

Do not commit DB passwords or service-role keys.

## Run

Default run creates backups before reset:

```bash
npm run supabase:reset-the-liga
```

The script asks you to type:

```text
RESET THE LIGA
```

No deletion happens without `--confirm-reset-all-organizations` and the confirmation text.

## Run Without Backup

Use this only when the database contains disposable test data:

```bash
npm run supabase:reset-the-liga:no-backup
```

This mode does not call `supabase db dump`. It prints:

```text
BACKUP SKIPPED. ALL ORGANIZATION DATA WILL BE PERMANENTLY DELETED.
```

Then it requires two confirmations:

```text
DELETE WITHOUT BACKUP
RESET THE LIGA
```

The script still requires `SUPABASE_DB_PASSWORD`, the linked project, and project ref `arcstfcdnezmhvvsafop`.

## Backups

Before reset, the script creates:

```text
backups/pre-the-liga-reset/YYYYMMDD-HHMMSS/schema.sql
backups/pre-the-liga-reset/YYYYMMDD-HHMMSS/public-data.sql
backups/pre-the-liga-reset/YYYYMMDD-HHMMSS/migration-list.txt
```

Backup files are ignored by Git.

## Verification

After seed, the script writes:

```text
reset-verification.txt
final-verification.txt
```

The verification includes organization, membership, place, service, product, shift, finance, notification, and readiness counts.
