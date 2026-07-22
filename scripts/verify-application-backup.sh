#!/usr/bin/env bash
set -euo pipefail

for command_name in node openssl tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/rmi-application-backup.tar.gz.enc" >&2
  exit 1
fi

if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" || ${#BACKUP_ENCRYPTION_KEY} -lt 24 ]]; then
  echo "BACKUP_ENCRYPTION_KEY must contain at least 24 characters." >&2
  exit 1
fi

encrypted_archive="$1"
checksum_file="$encrypted_archive.sha256"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/rmi-application-verify.XXXXXX")"
decrypted_archive="$staging_dir/backup.tar.gz"
manifest_file="$staging_dir/manifest.json"
trap 'rm -rf "$staging_dir"' EXIT

if [[ ! -f "$encrypted_archive" || ! -f "$checksum_file" ]]; then
  echo "Backup archive or checksum file is missing." >&2
  exit 1
fi

expected_checksum="$(awk '{print $NF}' "$checksum_file")"
actual_checksum="$(openssl dgst -sha256 "$encrypted_archive" | awk '{print $NF}')"

if [[ "$expected_checksum" != "$actual_checksum" ]]; then
  echo "Backup checksum does not match." >&2
  exit 1
fi

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$encrypted_archive" \
  -out "$decrypted_archive"

tar -tzf "$decrypted_archive" >/dev/null
tar -xOzf "$decrypted_archive" payload/manifest.json > "$manifest_file"

node - "$manifest_file" <<'NODE'
const { readFileSync } = require("node:fs");
const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const requiredTables = ["profiles", "artists", "price_history", "transactions", "watchlist"];

if (manifest.format !== "rmi-application-backup" || manifest.formatVersion !== 1) {
  throw new Error("Unrecognized backup manifest.");
}

for (const table of requiredTables) {
  if (!Number.isInteger(manifest.tableCounts?.[table]) || manifest.tableCounts[table] < 0) {
    throw new Error(`Backup manifest is missing a valid ${table} row count.`);
  }
}

if (!Number.isInteger(manifest.authUserCount) || !Number.isInteger(manifest.storageObjectCount)) {
  throw new Error("Backup manifest is missing Auth or Storage counts.");
}
NODE

echo "Backup checksum, encryption, archive, and manifest are valid."
