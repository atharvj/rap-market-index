#!/usr/bin/env bash
set -euo pipefail

for command_name in node openssl tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

for variable_name in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY BACKUP_ENCRYPTION_KEY; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "$variable_name is required." >&2
    exit 1
  fi
done

if [[ ${#BACKUP_ENCRYPTION_KEY} -lt 24 ]]; then
  echo "BACKUP_ENCRYPTION_KEY must contain at least 24 characters." >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-$HOME/RMI-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
encrypted_archive="$backup_dir/rmi-application-$timestamp.tar.gz.enc"
partial_archive="$encrypted_archive.partial"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/rmi-application-backup.XXXXXX")"

umask 077
mkdir -p "$backup_dir"
trap 'rm -rf "$staging_dir"; rm -f "$partial_archive"' EXIT

export BACKUP_EXPORT_DIR="$staging_dir/payload"
node scripts/export-application-data.mjs
cp -R supabase/migrations "$BACKUP_EXPORT_DIR/schema/migrations"
cp supabase/seed.sql "$BACKUP_EXPORT_DIR/schema/seed.sql"

tar -C "$staging_dir" -czf - payload \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass env:BACKUP_ENCRYPTION_KEY \
      -out "$partial_archive"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$partial_archive" \
  | tar -tzf - >/dev/null

mv "$partial_archive" "$encrypted_archive"
openssl dgst -sha256 "$encrypted_archive" > "$encrypted_archive.sha256"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "backup_path=$encrypted_archive" >> "$GITHUB_OUTPUT"
  echo "checksum_path=$encrypted_archive.sha256" >> "$GITHUB_OUTPUT"
fi

echo "Encrypted application backup created and archive-checked: $encrypted_archive"
