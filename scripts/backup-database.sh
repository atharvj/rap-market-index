#!/usr/bin/env bash
set -euo pipefail

for command_name in pg_dump pg_restore openssl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is required." >&2
  exit 1
fi

backup_key="${BACKUP_ENCRYPTION_KEY:-}"
if [[ ${#backup_key} -lt 24 ]]; then
  echo "BACKUP_ENCRYPTION_KEY must contain at least 24 characters." >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-$HOME/RMI-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
encrypted_dump="$backup_dir/rmi-$timestamp.dump.enc"
partial_dump="$encrypted_dump.partial"

umask 077
mkdir -p "$backup_dir"
trap 'rm -f "$partial_dump"' EXIT

export PGDATABASE="$SUPABASE_DB_URL"
export BACKUP_ENCRYPTION_KEY="$backup_key"

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file=- \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass env:BACKUP_ENCRYPTION_KEY \
      -out "$partial_dump"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$partial_dump" \
  | pg_restore --list >/dev/null

mv "$partial_dump" "$encrypted_dump"
openssl dgst -sha256 "$encrypted_dump" > "$encrypted_dump.sha256"

echo "Encrypted backup created and archive-checked: $encrypted_dump"
echo "Copy both the .enc and .sha256 files to storage outside this laptop."
