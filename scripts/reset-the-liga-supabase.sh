#!/usr/bin/env bash
set -euo pipefail

CONFIRM_FLAG="--confirm-reset-all-organizations"
SKIP_BACKUP_FLAG="--skip-backup-i-understand-data-loss"
EXPECTED_PROJECT_REF="arcstfcdnezmhvvsafop"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$PROJECT_ROOT/supabase/admin/reset_and_seed_the_liga_az.sql"
BACKUP_ROOT="$PROJECT_ROOT/backups/pre-the-liga-reset"
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"

usage() {
  cat <<USAGE
Usage:
  SUPABASE_DB_PASSWORD=... npm run supabase:reset-the-liga
  SUPABASE_DB_PASSWORD=... npm run supabase:reset-the-liga:no-backup

Required:
  $CONFIRM_FLAG
  SUPABASE_DB_PASSWORD
  linked Supabase project: $EXPECTED_PROJECT_REF

Optional:
  SUPABASE_PROJECT_REF       Overrides linked project ref.
  RESET_CONFIRM_TEXT         Non-interactive confirmation text: RESET THE LIGA
  DELETE_WITHOUT_BACKUP_CONFIRM_TEXT
                             Non-interactive no-backup confirmation text: DELETE WITHOUT BACKUP
USAGE
}

has_confirm_flag=false
skip_backup=false
for arg in "$@"; do
  case "$arg" in
    "$CONFIRM_FLAG") has_confirm_flag=true ;;
    "$SKIP_BACKUP_FLAG") skip_backup=true ;;
    -h|--help) usage; exit 0 ;;
  esac
done

if [ "$has_confirm_flag" != true ]; then
  echo "Refusing to continue: missing $CONFIRM_FLAG." >&2
  usage >&2
  exit 64
fi

command -v supabase >/dev/null 2>&1 || {
  echo "Supabase CLI is not installed or not in PATH." >&2
  exit 127
}

if [ ! -f "$PROJECT_ROOT/supabase/config.toml" ]; then
  echo "Supabase project is not initialized in this repo: supabase/config.toml is missing." >&2
  echo "Run: supabase init" >&2
  exit 66
fi

if [ -z "$PROJECT_REF" ]; then
  if [ -f "$PROJECT_ROOT/supabase/.temp/project-ref" ]; then
    PROJECT_REF="$(tr -d '[:space:]' < "$PROJECT_ROOT/supabase/.temp/project-ref")"
  elif [ -f "$PROJECT_ROOT/.env.local" ]; then
    PROJECT_REF="$(node -e "const fs=require('fs'); const s=fs.readFileSync('$PROJECT_ROOT/.env.local','utf8'); const m=s.match(/^VITE_SUPABASE_URL=(.*)$/m); if(!m) process.exit(1); console.log(new URL(m[1].trim()).hostname.split('.')[0]);" 2>/dev/null || true)"
  fi
fi

if [ -z "$PROJECT_REF" ]; then
  echo "Could not determine Supabase project ref. Run: supabase link --project-ref <ref>" >&2
  exit 66
fi

if [ "$PROJECT_REF" != "$EXPECTED_PROJECT_REF" ]; then
  echo "Refusing to continue: target project ref must be $EXPECTED_PROJECT_REF, got $PROJECT_REF." >&2
  exit 66
fi

if [ ! -f "$PROJECT_ROOT/supabase/.temp/project-ref" ]; then
  echo "Supabase project is not linked in this repo: supabase/.temp/project-ref is missing." >&2
  echo "Run: supabase link --project-ref $PROJECT_REF" >&2
  exit 66
fi

LINKED_REF="$(tr -d '[:space:]' < "$PROJECT_ROOT/supabase/.temp/project-ref")"
if [ "$LINKED_REF" != "$PROJECT_REF" ]; then
  echo "Linked project ref ($LINKED_REF) does not match target ref ($PROJECT_REF)." >&2
  exit 66
fi

if [ "$LINKED_REF" != "$EXPECTED_PROJECT_REF" ]; then
  echo "Refusing to continue: linked project ref must be $EXPECTED_PROJECT_REF, got $LINKED_REF." >&2
  exit 66
fi

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo "SUPABASE_DB_PASSWORD is required. Do not commit it; pass it only as an environment variable." >&2
  exit 65
fi

if [ ! -f "$SQL_FILE" ]; then
  echo "SQL file not found: $SQL_FILE" >&2
  exit 66
fi

if [ "$skip_backup" = true ]; then
  cat >&2 <<'WARNING'
========================================================================
BACKUP SKIPPED. ALL ORGANIZATION DATA WILL BE PERMANENTLY DELETED.
========================================================================
WARNING

  if [ -t 0 ]; then
    printf "Type DELETE WITHOUT BACKUP to continue: "
    read -r typed_no_backup_confirmation
  else
    typed_no_backup_confirmation="${DELETE_WITHOUT_BACKUP_CONFIRM_TEXT:-}"
  fi

  if [ "$typed_no_backup_confirmation" != "DELETE WITHOUT BACKUP" ]; then
    echo "No-backup confirmation text mismatch. Reset cancelled." >&2
    exit 64
  fi
fi

if [ -t 0 ]; then
  printf "This will delete ALL organization tenant data in project %s. Type RESET THE LIGA to continue: " "$PROJECT_REF"
  read -r typed_confirmation
else
  typed_confirmation="${RESET_CONFIRM_TEXT:-}"
fi

if [ "$typed_confirmation" != "RESET THE LIGA" ]; then
  echo "Confirmation text mismatch. Reset cancelled." >&2
  exit 64
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

echo "Supabase CLI: $(supabase --version)"
echo "Target project ref: $PROJECT_REF"

echo "Checking linked migrations..."
supabase migration list --linked

echo "Running read-only preflight checks..."
supabase db query --linked "
select
  (select count(*) from public.organizations) as organization_count,
  (select count(*) from auth.users) as auth_users_count,
  exists (
    select 1
    from public.platform_user_roles
    where user_id = 'f68a21a5-d2b4-4e96-a331-ff5ccf2cc22c'
      and role = 'platform_owner'
  ) as platform_owner_exists,
  exists (
    select 1
    from auth.users
    where id = '249f97ea-f12a-43a7-bb52-5f08bfc2c7ec'
  ) as organization_admin_auth_user_exists,
  exists (
    select 1
    from public.profiles
    where id = '249f97ea-f12a-43a7-bb52-5f08bfc2c7ec'
      and is_active = true
  ) as organization_admin_profile_exists;

select id, name, slug, status
from public.organizations
order by created_at asc;
" --output table

if [ "$skip_backup" = true ]; then
  BACKUP_DIR=""
else
  BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
  mkdir -p "$BACKUP_DIR"
  echo "Backup dir: $BACKUP_DIR"

  echo "Saving linked migration list..."
  supabase migration list --linked > "$BACKUP_DIR/migration-list.txt"

  echo "Creating schema backup..."
  supabase db dump --linked --password "$SUPABASE_DB_PASSWORD" --schema public,auth,storage --file "$BACKUP_DIR/schema.sql"

  echo "Creating public data backup..."
  supabase db dump --linked --password "$SUPABASE_DB_PASSWORD" --schema public --data-only --use-copy --file "$BACKUP_DIR/public-data.sql"
fi

echo "Applying destructive reset and AZ seed..."
if [ "$skip_backup" = true ]; then
  supabase db query --linked --file "$SQL_FILE" --output table
else
  supabase db query --linked --file "$SQL_FILE" --output table | tee "$BACKUP_DIR/reset-verification.txt"
fi

echo "Running final verification..."
verification_sql="
select set_config('request.jwt.claim.sub', 'f68a21a5-d2b4-4e96-a331-ff5ccf2cc22c', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

do \$\$
declare
  organizations_count integer;
  admin_membership_count integer;
begin
  select count(*) into organizations_count from public.organizations;
  if organizations_count <> 1 then raise exception 'Expected organizations count = 1, got %', organizations_count; end if;

  if not exists (
    select 1 from public.organizations
    where slug = 'the-liga'
      and default_locale = 'az'
  ) then
    raise exception 'Expected organization slug=the-liga and default_locale=az.';
  end if;

  if (select count(*) from public.places) <> 12 then raise exception 'Expected places count = 12.'; end if;
  if (select count(*) from public.places where has_timer = true) <> 7 then raise exception 'Expected timed places count = 7.'; end if;
  if (select count(*) from public.places where type = 'table') <> 5 then raise exception 'Expected tables count = 5.'; end if;
  if (select count(*) from public.shift_templates) <> 2 then raise exception 'Expected shift templates count = 2.'; end if;

  select count(*) into admin_membership_count
  from public.organization_memberships
  where user_id = '249f97ea-f12a-43a7-bb52-5f08bfc2c7ec'
    and role = 'organization_admin'
    and is_active = true;
  if admin_membership_count <> 1 then raise exception 'Expected active admin membership count = 1, got %', admin_membership_count; end if;

  if not exists (
    select 1
    from public.platform_user_roles
    where user_id = 'f68a21a5-d2b4-4e96-a331-ff5ccf2cc22c'
      and role = 'platform_owner'
  ) then
    raise exception 'Platform owner role was not preserved.';
  end if;
end;
\$\$;

select
  (select count(*) from public.organizations) as organizations,
  (select count(*) from public.organization_memberships) as memberships,
  (select count(*) from public.places) as places,
  (select count(*) from public.places where has_timer = true) as timed_places,
  (select count(*) from public.places where type = 'table') as tables,
  (select count(*) from public.services) as services,
  (select count(*) from public.products) as products,
  (select count(*) from public.shift_templates) as shift_templates,
  (select count(*) from public.finance_categories) as finance_categories,
  (select count(*) from public.organization_notification_settings) as notification_settings;
select public.get_organization_readiness(id) as readiness
from public.organizations
where slug = 'the-liga';
"

if [ "$skip_backup" = true ]; then
  supabase db query --linked "$verification_sql" --output table
  echo "Done. Backup was skipped by explicit confirmation."
else
  supabase db query --linked "$verification_sql" --output table | tee "$BACKUP_DIR/final-verification.txt"
  echo "Done. Backups and verification reports are in $BACKUP_DIR"
fi
