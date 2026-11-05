# November 5 operational reliability repair

The live audit reproduced a 500 response while reading previous signal snapshots.
Twenty of the latest thirty catalyst runs had failed. The previous reader selected
up to 1,000 historical evidence documents before discarding all but the latest for
each artist. Migration 048 uses indexed per-artist lookups and returns only the
actual most recent prior row and required evidence fields. It preserves missing
history, sentiment baselines, date boundaries and private access; failed reads
still prevent publication. No price formula or historical quote is changed.

The production daily scheduler also retained a legacy 25-artist batch setting.
Multiple sequential collection requests risked exceeding its outer five-minute
execution limit, leaving a partial daily opening. The current 89-artist roster now
fits one worker request even with that legacy setting. Opening verification still
requires a saved close for every active artist; it does not open on a partial run.

Encrypted backups failed with `RangeError: Invalid string length` when a full
large table was converted to one pretty-printed JSON string. The exporter now
writes individual rows with backpressure, retains valid JSON-array files, orders
pages deterministically, and removes partial files on failure. The table manifest
includes row counts and SHA-256 checksums verified after decryption. It now includes
valuation boundaries and product analytics, which earlier exports omitted.
Archives remain encrypted and stored outside Supabase. This live paginated export
is not a transactionally consistent database snapshot or full Auth password backup.

Scheduler error traps now print the completion stage and error from failed JSON
responses, so operators can see the cause instead of only curl's HTTP 500 status.
No credentials or full quote payloads are deliberately printed by these traps.

Regression tests cover latest prior selection across uneven histories, private
function permissions, failed baseline reads, streamed pagination and partial-file
cleanup, and the legacy scheduler configuration. Actual SQL and production
verification results are recorded in the workspace handoff after deployment.

The first live retry encountered a transient HTTP 521 from the database provider
before exporting any table. Backup page reads now retry transient connection/server
failures twice, without retrying authorization or schema errors. Failed HTML
responses are summarized instead of dumping the page into the workflow log.

The current dependency audit also flagged patches published since the prior
release. Next.js is updated to 15.5.29, Sentry to 10.78.0, and Vitest to 4.1.12;
patched URI and glob dependencies are included. The glob override affects Sentry's
build tooling and is validated by the production build. References:
[Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[Sentry advisory](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55).

The market tape now says “Market Quotes” instead of an unconditional “Market
Live” indicator. Its old label appeared even when trading was paused or scheduled
source updates were delayed. This copy change does not imply tick-by-tick feeds
or alter trading availability.
