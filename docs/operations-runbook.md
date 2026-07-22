# RMI Operations Runbook

## Daily Release Window

RMI uses an Eastern market date because major music releases commonly arrive at
midnight Eastern. At the start of each new date, trading fails closed until the
release-window automation has completed both stages:

1. scan verified media feeds for new releases and other price-relevant events;
2. run the full source-based market update for every active artist.

The GitHub workflow calls `/api/cron/release-window` in several daylight-saving-safe
slots. The endpoint is idempotent: after all active artists have a verified close
for the current date, later retries return without scanning or repricing again.
Vercel runs a later fallback. A newly detected high-confidence catalyst can also
pause only the affected artist until a subsequent market-run quote incorporates it.

If trading remains paused, check the **Open daily release window** GitHub Action,
then Vercel function logs for the `release-scan`, `market-update`, or `verification`
stage. Re-run the workflow manually after fixing the reported source or deployment
problem. Do not bypass the gate by marking a run successful or fabricating a price.

## Error Monitoring

RMI supports Sentry without sending default personally identifiable information. The SDK removes user objects, cookies, authorization headers, request bodies, query strings, and sensitive breadcrumb fields before an event leaves the app.

Create a free Sentry Next.js project, then add these Vercel variables to Production, Preview, and Development:

```text
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

`NEXT_PUBLIC_SENTRY_DSN` enables runtime reports. The other three variables upload private source maps during a deployment. Keep `SENTRY_AUTH_TOKEN` server-only.

Test monitoring from a Preview deployment before Production. Never add account emails, auth IDs, access tokens, request bodies, or market secrets as Sentry tags or context.

## Database Backups

The **Encrypted application backup** GitHub workflow runs every day after the
release-window update. It exports every RMI application table, Auth user records,
and Storage objects, encrypts the archive before uploading it, verifies the
archive, and retains the encrypted GitHub artifact for 30 days. The encryption
key is kept in GitHub Actions secrets and the operator's local password keychain;
it is not stored in the repository or backup artifact.

Run the workflow manually after a major data operation and confirm the run is
green. Download both artifact files before an important launch or migration if a
longer-lived copy is required.

The application export cannot recover Supabase password hashes or active Auth
sessions. The tracked migrations rebuild database functions, triggers, policies,
and schema. A PostgreSQL dump remains the more complete disaster-recovery format
when direct database credentials are available.

Supabase dashboard backups and PostgreSQL dumps serve additional failure cases.
Keep them too when the project tier and database access support them.

1. Install the PostgreSQL client tools and OpenSSL.
2. Set `SUPABASE_DB_URL` locally to the direct or session-pooler database URL. Do not commit it.
3. Generate a random encryption passphrase of at least 24 characters and set it as `BACKUP_ENCRYPTION_KEY`. Store a copy in a password manager.
4. Run `npm run backup:database`.
5. Copy the generated `.enc` and `.sha256` files from `~/RMI-backups` to encrypted storage outside this laptop.

Database dumps contain Storage metadata, not the uploaded avatar object bytes. Keep a separate export of the `profile-avatars` bucket when user-uploaded avatars become important to retain.

The encrypted dump is a data-recovery artifact, not a complete environment clone. The backup intentionally omits ownership and grant restoration. In a full recovery, deploy the current Supabase migrations after restoring data so functions, RLS policies, grants, hooks, and scheduled jobs match the reviewed application version.

## Restore Drill

An archive check is not a restore test. At least monthly:

1. Create an empty disposable PostgreSQL database or local Supabase stack.
2. Set `RESTORE_TEST_DB_URL` to that database. Never use the production URL.
3. Set `ALLOW_RESTORE_TEST_DATABASE=YES_DELETE_THE_TEST_DATABASE`.
4. Run `npm run restore:test -- /path/to/rmi-backup.dump.enc`.
5. Confirm profiles, holdings, transactions, artists, market events, and price history are present.
6. Apply the current Supabase migrations to the disposable database.
7. Confirm private tables remain inaccessible to anonymous and authenticated browser clients.
8. Delete the disposable database after recording the drill date and result.

The restore script compares both connection strings and live database identities, refuses the production target, and requires an explicit destructive-action phrase. Still read the target URL before running it.

## Incident Response

If a secret is exposed, remove it from the app, rotate it at the provider, update Vercel, redeploy, and review provider logs. Deleting it from the latest Git commit is not sufficient because Git history and old deployments may retain it.

If another user's data becomes visible, disable the affected route, preserve logs, identify the access window, fix both API authorization and database policy, and notify affected users as required.
