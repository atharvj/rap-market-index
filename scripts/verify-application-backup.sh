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

tar -xzf "$decrypted_archive" -C "$staging_dir" payload/tables

node - "$manifest_file" "$staging_dir/payload/tables" <<'NODE'
const { readFileSync, createReadStream } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");
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
async function verifyTables() {
  if (!manifest.tableChecksums) return; // Backward compatibility with older archives.
  for (const required of ["market_valuation_boundaries", "product_analytics_events"]) {
    if (!(required in manifest.tableChecksums)) throw new Error(`Backup omits ${required}.`);
  }
  for (const [table, count] of Object.entries(manifest.tableCounts)) {
    if (!/^[a-z_]+$/.test(table) || !Number.isInteger(count) || count < 0 ||
        !/^[a-f0-9]{64}$/.test(manifest.tableChecksums[table] ?? "")) throw new Error("Invalid table manifest.");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(join(process.argv[3], table + ".json"))) hash.update(chunk);
    if (hash.digest("hex") !== manifest.tableChecksums[table]) throw new Error(`Table checksum mismatch: ${table}.`);
  }
}
verifyTables().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE

echo "Backup checksum, encryption, archive, and manifest are valid."
