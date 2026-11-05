# November 5 broader audit and reset decision

This audit separates functional correctness from predictive evidence. Passing a
build, a security audit or chart consistency checks does not establish that every
artist's quote is a correct valuation. The pricing engine remains rmi-core-v47;
these repairs do not change its weights or create new artist price targets.

## Reset decision: preserve the market and its evidence

Do not erase quotes, trades, portfolios, observations or correction records.
The October 18 recalibration already established the shared audience baseline for
all 89 active artists. Later improvements primarily repaired publication, database
reads, backups and dependencies. A full reset would remove the historical rates,
reception baselines, duplicate-event accounting and subsequent outcomes needed to
evaluate and improve the model. A smoother or more jagged chart does not establish
accuracy. Existing records are not replayed as fabricated market observations.

The old prelaunch reset was a sequence of independent table deletes and updates.
It could fail partway through, retained correction records inconsistent with newly
seeded prices, and its operator description did not match the retained source data.
That tool and its destructive operator form are retired. Authenticated operators
receive an unavailable response; the old confirmation cannot execute deletes.
No reset was performed. A future fresh competition, if explicitly chosen, should
preserve an archive and define new account/quote boundaries before implementation.

## Evidence collected

| Area | Checks and outcome |
| --- | --- |
| Pricing evidence | Read saved v47 executed returns and subsequent audience data without changing prices. Results below are provisional. |
| Public data | Production can no longer silently serve demo quotes, news, rankings, history or open status after a missing configuration. Temporary errors have no-store headers. |
| Client sessions | Superseded market requests cannot overwrite newer quotes. Account switches clear private state immediately, and late profile/watchlist/ranking responses are scoped to the active user. |
| Source scheduling | A scheduled catalyst run exposed another growing-history timeout. Source freshness now uses an indexed private lookup returning one timestamp per requested artist instead of paging through every historical source row. |
| Concurrent publication | Snapshot and artist-history reads verify quote revisions after loading dependent data, retry once after a change, and reject a repeatedly changing result. |
| Freshness | Public snapshots report verified refresh coverage; the UI identifies delayed artists and the last complete refresh rather than implying a fresh update. Missing/invalid/future timestamps do not establish freshness. |
| Trading readiness | Failed catalyst/tick reads prevent execution. SQL requires a close for every active artist and fails closed with missing controls. Inactive closes cannot replace missing active ones. |
| Transaction execution | The service-only trade gateway checks and locks market controls inside the order transaction. PostgreSQL tests execute buy/sell, short/cover, rejected overlap/oversize/fractional orders, pause checks and a late failure that rolls back cash and holdings. |
| Account privacy | Anonymous direct reads of live cash data were denied. Schema audit verifies RLS and table/RPC privileges; browser authorization tests cover private routes. No real user login or order was performed. |
| Rankings | An empty real leaderboard no longer creates a demo guest rank. |
| Time boundaries | Timestamp dates and intraday chart times now use the same Eastern market session as the engine instead of a conflicting Pacific date boundary. |
| Operations | Daily scheduled CI checks advisories, types, tests, build and browser flows even without a push, then reads every production artist graph. It allows the existing guarded recovery four minutes to refresh delayed quotes and fails if they remain stale. GitHub scheduling remains best-effort. |
| Backup | The preceding complete run exported 292,033 rows, encrypted and verified its archive and table checksums, and stored it outside Supabase. This is a live paginated application export, not a tested full point-in-time database/Auth-password restore. |

## Current-model outcome assessment

Read-only assessment at 2026-11-05T18:08:55Z, using October 19–27 v47 signals:

- 801 artist-day samples, 89 artists, nine signal dates.
- 801 samples have execution timestamps and only observations available by that
  timestamp establish the pre-signal baselines.
- Seven-day directional accuracy: 56.2% on 733 directional samples; balanced
  accuracy: 56.4%; majority-direction benchmark: 51.6%.
- Overall rank correlation: 0.156; average daily rank correlation: 0.154.
- Only one non-overlapping outcome window; eight recommended by the existing
  validation policy. The result is **provisional**, not proven predictive skill.

These are audience-growth/consumption-acceleration outcomes, not a measure of
absolute fair dollar prices or representative fan opinion. Artist-day samples
share dates, providers and overlapping horizons, so 801 is not 801 independent
experiments. This assessment does not establish that v47 outperforms older models
on a matched holdout. No weights were tuned to this small evaluation window.

Validation maturity now counts only timestamp-verified samples and independent
verified dates. Numerous legacy proxy samples cannot earn a measured status.
Null outcomes are withheld instead of becoming zero, and invalid dates are rejected.

## Verification limits

Actual Google authorization redirects and signup settings were checked; completing
an external user's Google consent still requires that person. No production trades,
account deletion or portfolio resets were performed for testing. Free source
coverage and selected reaction samples remain incomplete and can be biased; Reddit
access remains disabled. These limits are not repaired by deleting the data.

Final test/deployment and live production-readiness results are recorded in the
workspace handoff after this release. The scheduled readiness check covers all
returned active quotes and graphs; it is not a guarantee against every future bug.
