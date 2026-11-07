# Public market notices and refresh recovery — November 7

Removed the shared public banners for stale quote coverage, background feed errors,
and valuation recalibrations at the user's request. The underlying freshness,
correction metadata, server monitoring and automated readiness checks remain.
Background failures retain the last verified quotes. If initial data cannot load,
the existing page empty states and trading gates still handle unavailable data.
Action-specific form/order errors remain necessary to explain failed actions.

The reported 89/89 delay reflected a real failure. Scheduled catalyst and news jobs
were failing on `get_latest_source_observation_times` for `media_rss`. Reproduced
through the production service API: statement timeout after about 8.5 seconds.
The same concrete indexed SELECT completed in 149 ms, indicating the SQL function's
parameter-insensitive cached plan was the problem, rather than a missing index.

Migration 052 replaces that lookup with a private, stable, security-invoker PL/pgSQL
function using a fixed SELECT and bound arguments. EXECUTE replans for the actual
values; no identifiers or values are interpolated. This follows [PostgreSQL's
EXECUTE/USING documentation](https://www.postgresql.org/docs/current/plpgsql-statements.html#PLPGSQL-STATEMENTS-EXECUTING-DYN).
The source/date filters, per-artist latest timestamp, and service-only permissions
are preserved. No pricing formula, historical prices, portfolios or reset behavior
changed.

Applied migration 052 to production and verified eight real service reads across
media RSS, GDELT and AI-research histories. Repeated all-artist media RSS lookups
returned 89 timestamps in 107–527 ms without a timeout. PostgreSQL tests cover
source/date isolation, duplicate/missing artists, private grants and repeated
prepared RPC calls. Updated browser regressions cover hidden operational banners
and retention/recovery of verified quote data.

Final deployment, CI and guarded refresh outcomes are recorded in RMI_HANDOFF.md.

A live public check also reproduced a separate chart-loading timeout in the legacy
valuation-correction query. Migration 053 adds a partial date/artist index for
snapshots that actually contain a correction. The reader now selects only the
correction and pre-correction price instead of downloading whole evidence JSON.
Legacy fallback, correction validation, conflict detection and permanent ledger
records remain; no history is discarded to avoid the query.

The next recovery exposed a five-minute release-window timeout. Publisher discovery delayed the daily
worker; request logs also showed a downstream worker failure. The release-window
wrapper now invokes the existing daily quote worker directly and verifies the
completed run/roster coverage. Dedicated news and catalyst workers continue
discovery; current daily prices still use recorded verified events and current
audience measurements. The distributed automation guard and closed-on-failure
trading behavior remain.

A full-roster read-only daily calculation then succeeded for all 89 artists in
185 seconds, supporting the need to reserve the opening's execution window for
calculation/publication. Its source warnings withheld unsuitable Polymarket
contracts and unverifiable comment uploaders; those safeguards remain enabled.

The controlled standard daily worker retry exposed an intermittent YouTube
baseline-read statement timeout (the full read-only run had passed). Migration
054 covers numerical source/date/artist/metric reads with value and observation
timestamps, avoiding evidence heap reads for the ordered baseline pages. Baseline
windows, rate calculations and pricing weights are unchanged.
The exact baseline loader (including recent and annual windows) subsequently
passed four consecutive all-artist reads in 1.0–2.2 seconds.

After baseline reads were fixed, the standard live worker reached persistence and
exposed a separate oversized observation-upsert timeout. Evidence writes now use
at most 100 rows or approximately 1 MiB per request, with an individual larger
record retained intact. Only explicit database cancellation is retried once, with
identical rows/timestamps. Duplicate identities and non-finite values fail before
writes; source error flags clear only after all batches succeed. Partial evidence
is safe to retry, and quote publication still requires successful completion of
the entire evidence save before the existing atomic quote transaction runs.
Regression tests cover byte/row limits, complete retention, stable retries,
failures that prevent later saves/cleanup, and invalid input.
