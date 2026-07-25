# Backend Notes

This is a short map of the Rap Market Index backend. Setup steps live in
[`supabase-setup.md`](supabase-setup.md), production procedures in
[`operations-runbook.md`](operations-runbook.md), and launch/security checks in
[`security-and-scaling.md`](security-and-scaling.md).

## Product boundary

RMI is a free fantasy market. Users trade artist shares with virtual cash; there
are no deposits, withdrawals, prizes, or ownership claims.

The current launch scope is:

- artist stocks
- continuous portfolios
- long positions
- watchlists and favorite artists
- public profiles and rankings
- source-backed market updates

Short selling and leagues have backend foundations but are not part of the
public launch.

## Data flow

The market engine collects recorded observations, release data, relevant news,
and eligible user order flow. It then:

1. validates source data and rejects anomalous changes;
2. classifies and deduplicates market events;
3. scores each artist using the configured model version;
4. applies movement and integrity guardrails;
5. writes prices, history, quote ticks, observations, and an update-run record.

Runs are idempotent by market date. Historical points are persisted results,
not generated chart filler.

## Signal sources

The production engine can use:

- Last.fm listener and play-count movement
- YouTube channel growth, uploads, and sampled comments
- Wikimedia pageviews
- MusicBrainz release metadata
- GDELT and selected music publication feeds
- source-backed research classification
- Reddit and Bluesky public reaction
- eligible non-admin trade flow

Some adapters are optional and depend on environment configuration. A missing
optional source must not be presented as a broken market.

No single headline should determine a quote. News is filtered for artist
relevance, evidence quality, market connection, and duplication before it can
contribute to a run. Secondhand gossip and generic lifestyle coverage are not
market catalysts.

## Main code paths

- `app/api/admin/daily-market-update/route.ts` — protected market run
- `app/api/cron/daily-market-update/route.ts` — scheduled run entry point
- `app/api/cron/release-window/route.ts` — midnight release-window checks
- `app/api/market/news/route.ts` — public, grouped news feed
- `src/server/market/daily-update.ts` — quote calculation
- `src/server/market/event-signals.ts` — event scoring and deduplication
- `src/server/market/gdelt-source.ts` — article classification
- `src/server/market/news-story-groups.ts` — shared story grouping
- `src/server/market/supabase-repository.ts` — market persistence
- `app/api/admin/market-health/route.ts` — operator health checks

## Account and trade integrity

- Supabase Auth is the account authority.
- Google and password identities with the same verified email belong to one
  account.
- Email confirmation is required before app access.
- Usernames are unique by normalized key.
- Server routes authorize every private write.
- Trades use database-side integrity checks and idempotency keys.
- Admin trades do not influence market-demand signals.
- Account recreation has a cooldown, with explicit test-account exemptions.

## Changes that need migrations

Use a migration only for a durable database change: tables, columns, indexes,
constraints, policies, or database functions. Artist roster edits and ordinary
application behavior changes should use the existing admin tools or code, not
one-off migrations.

Keep applied migrations in version control. Do not delete migrations that form
part of the production schema history.

## Release checks

Before pushing a meaningful change:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

After deployment, check `/dev`, the GitHub workflow run, public news, and the
latest market run. Warnings should describe actionable failures, not absent
optional integrations.

## Next work

- Observe tester behavior before adding leagues or more asset types.
- Monitor whether the event model remains calibrated as news volume grows.
- Add paid infrastructure only when free-tier limits or real usage justify it.
- Keep operational docs current and keep this file concise.
