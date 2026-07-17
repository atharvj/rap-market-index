#!/usr/bin/env bash
set -euo pipefail

for command_name in openssl pg_restore; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/rmi-backup.dump.enc" >&2
  exit 1
fi

backup_key="${BACKUP_ENCRYPTION_KEY:-}"
if [[ ${#backup_key} -lt 24 ]]; then
  echo "BACKUP_ENCRYPTION_KEY must contain at least 24 characters." >&2
  exit 1
fi

encrypted_dump="$1"
checksum_file="$encrypted_dump.sha256"

if [[ ! -f "$encrypted_dump" ]]; then
  echo "Backup file not found: $encrypted_dump" >&2
  exit 1
fi

if [[ ! -f "$checksum_file" ]]; then
  echo "Backup checksum file not found: $checksum_file" >&2
  exit 1
fi

expected_checksum="$(awk '{print $NF}' "$checksum_file")"
actual_checksum="$(openssl dgst -sha256 "$encrypted_dump" | awk '{print $NF}')"
if [[ "$expected_checksum" != "$actual_checksum" ]]; then
  echo "Backup checksum does not match." >&2
  exit 1
fi

export BACKUP_ENCRYPTION_KEY="$backup_key"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$encrypted_dump" \
  | pg_restore --list >/dev/null

echo "Backup checksum and PostgreSQL archive structure are valid."
