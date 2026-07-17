#!/usr/bin/env bash
set -euo pipefail

for command_name in openssl pg_restore psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/rmi-backup.dump.enc" >&2
  exit 1
fi

if [[ "${ALLOW_RESTORE_TEST_DATABASE:-}" != "YES_DELETE_THE_TEST_DATABASE" ]]; then
  echo "Set ALLOW_RESTORE_TEST_DATABASE=YES_DELETE_THE_TEST_DATABASE to confirm this destructive test restore." >&2
  exit 1
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is required so the production target can be identified and refused." >&2
  exit 1
fi

if [[ -z "${RESTORE_TEST_DB_URL:-}" ]]; then
  echo "RESTORE_TEST_DB_URL is required and must point to an empty disposable database." >&2
  exit 1
fi

if [[ "$RESTORE_TEST_DB_URL" == "$SUPABASE_DB_URL" ]]; then
  echo "Refusing to restore into the production database URL." >&2
  exit 1
fi

production_identity="$(PGDATABASE="$SUPABASE_DB_URL" psql --no-psqlrc --tuples-only --no-align --command="select coalesce(inet_server_addr()::text, ''), inet_server_port(), current_database()" | tr -d '[:space:]')"
restore_identity="$(PGDATABASE="$RESTORE_TEST_DB_URL" psql --no-psqlrc --tuples-only --no-align --command="select coalesce(inet_server_addr()::text, ''), inet_server_port(), current_database()" | tr -d '[:space:]')"

if [[ -z "$production_identity" || -z "$restore_identity" ]]; then
  echo "Could not identify both database targets; refusing the restore." >&2
  exit 1
fi

if [[ "$restore_identity" == "$production_identity" ]]; then
  echo "Refusing to restore into the production database target." >&2
  exit 1
fi

backup_key="${BACKUP_ENCRYPTION_KEY:-}"
if [[ ${#backup_key} -lt 24 ]]; then
  echo "BACKUP_ENCRYPTION_KEY must contain at least 24 characters." >&2
  exit 1
fi

encrypted_dump="$1"
if [[ ! -f "$encrypted_dump" ]]; then
  echo "Backup file not found: $encrypted_dump" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$script_dir/verify-database-backup.sh" "$encrypted_dump"

export BACKUP_ENCRYPTION_KEY="$backup_key"
export PGDATABASE="$RESTORE_TEST_DB_URL"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$encrypted_dump" \
  | pg_restore \
      --clean \
      --if-exists \
      --exit-on-error \
      --no-owner \
      --no-privileges \
      --file=- \
  | psql --set ON_ERROR_STOP=on --file=-

expected_tables=(
  profiles
  artists
  artist_stats
  price_history
  holdings
  transactions
  watchlist
  market_observations
  market_events
  market_update_runs
  price_ticks
  api_rate_limits
)

for table_name in "${expected_tables[@]}"; do
  table_status="$(
    psql \
      --no-psqlrc \
      --tuples-only \
      --no-align \
      --set ON_ERROR_STOP=on \
      --set table_name="$table_name" \
      --command="select case when c.oid is null then 'missing' when not c.relrowsecurity then 'rls-disabled' else 'ok' end from (select to_regclass('public.' || :'table_name') as oid) target left join pg_class c on c.oid = target.oid;" \
      | tr -d '[:space:]'
  )"

  if [[ "$table_status" != "ok" ]]; then
    echo "Restore validation failed for public.$table_name: $table_status" >&2
    exit 1
  fi
done

psql \
  --no-psqlrc \
  --set ON_ERROR_STOP=on \
  --command="select 'profiles' as table_name, count(*) as restored_rows from public.profiles union all select 'artists', count(*) from public.artists union all select 'holdings', count(*) from public.holdings union all select 'transactions', count(*) from public.transactions union all select 'price_history', count(*) from public.price_history order by table_name;"

echo "Test restore completed and core tables passed the RLS validation. Complete the application checks in docs/operations-runbook.md before deleting the test database."
