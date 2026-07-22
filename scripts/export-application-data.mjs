import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const exportDirectory = process.env.BACKUP_EXPORT_DIR?.trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!exportDirectory || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "BACKUP_EXPORT_DIR, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required."
  );
}

const tables = [
  "profiles",
  "artists",
  "artist_stats",
  "artist_external_ids",
  "market_controls",
  "artist_trading_halts",
  "price_history",
  "price_ticks",
  "market_observations",
  "market_events",
  "market_signal_snapshots",
  "market_update_runs",
  "holdings",
  "short_positions",
  "transactions",
  "short_transactions",
  "watchlist",
  "admin_action_log",
  "api_rate_limits",
  "blocked_signup_email_domains",
  "user_feedback"
];

const pageSize = 1_000;
const outputRoot = resolve(exportDirectory);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

await mkdir(resolve(outputRoot, "tables"), { recursive: true, mode: 0o700 });
await mkdir(resolve(outputRoot, "auth"), { recursive: true, mode: 0o700 });
await mkdir(resolve(outputRoot, "storage", "files"), { recursive: true, mode: 0o700 });
await mkdir(resolve(outputRoot, "schema"), { recursive: true, mode: 0o700 });

const tableCounts = {};

for (const table of tables) {
  const rows = await exportTable(table);
  tableCounts[table] = rows.length;
  await writePrivateJson(resolve(outputRoot, "tables", `${table}.json`), rows);
}

const authUsers = await exportAuthUsers();
await writePrivateJson(resolve(outputRoot, "auth", "users.json"), authUsers);

const storage = await exportStorage();
await writePrivateJson(resolve(outputRoot, "storage", "buckets.json"), storage.buckets);
await writePrivateJson(resolve(outputRoot, "storage", "objects.json"), storage.objects);

await writePrivateJson(resolve(outputRoot, "schema", "migration-index.json"), {
  migrations: await listMigrationFiles()
});

const manifest = {
  format: "rmi-application-backup",
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  projectHost: new URL(supabaseUrl).host,
  gitCommit: process.env.GITHUB_SHA?.trim() || null,
  tableCounts,
  authUserCount: authUsers.length,
  storageBucketCount: storage.buckets.length,
  storageObjectCount: storage.objects.length,
  limitations: [
    "Auth user records do not include password hashes or active sessions.",
    "Database functions, triggers, policies, and schema are restored from the tracked Supabase migrations."
  ]
};

await writePrivateJson(resolve(outputRoot, "manifest.json"), manifest);
process.stdout.write(
  `Exported ${Object.values(tableCounts).reduce((sum, count) => sum + count, 0)} database rows, `
  + `${authUsers.length} auth users, and ${storage.objects.length} storage objects.\n`
);

async function exportTable(table) {
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Could not export public.${table}: ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      return rows;
    }
  }
}

async function exportAuthUsers() {
  const users = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: pageSize });

    if (error) {
      throw new Error(`Could not export Auth users: ${error.message}`);
    }

    users.push(...data.users);

    if (data.users.length < pageSize) {
      return users;
    }
  }
}

async function exportStorage() {
  const { data: buckets, error } = await supabase.storage.listBuckets();

  if (error) {
    throw new Error(`Could not list Storage buckets: ${error.message}`);
  }

  const objects = [];

  for (const bucket of buckets ?? []) {
    const paths = await listStoragePaths(bucket.id);

    for (const objectPath of paths) {
      const { data, error: downloadError } = await supabase.storage.from(bucket.id).download(objectPath);

      if (downloadError) {
        throw new Error(`Could not download ${bucket.id}/${objectPath}: ${downloadError.message}`);
      }

      const archiveName = `${String(objects.length + 1).padStart(8, "0")}.bin`;
      await writeFile(
        resolve(outputRoot, "storage", "files", archiveName),
        Buffer.from(await data.arrayBuffer()),
        { mode: 0o600 }
      );
      objects.push({ bucketId: bucket.id, objectPath, archiveName, size: data.size });
    }
  }

  return { buckets: buckets ?? [], objects };
}

async function listStoragePaths(bucketId, prefix = "") {
  const files = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(bucketId).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" }
    });

    if (error) {
      throw new Error(`Could not list Storage path ${bucketId}/${prefix}: ${error.message}`);
    }

    for (const item of data ?? []) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.id) {
        files.push(itemPath);
      } else {
        files.push(...await listStoragePaths(bucketId, itemPath));
      }
    }

    if (!data || data.length < pageSize) {
      return files;
    }
  }
}

async function listMigrationFiles() {
  const migrationsDirectory = resolve(process.cwd(), "supabase", "migrations");
  const index = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));
  const { readdir } = await import("node:fs/promises");
  const migrations = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  return migrations.map((name) => ({ name, applicationVersion: index.version }));
}

async function writePrivateJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
