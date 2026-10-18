# Engine reliability review — October 18, 2026

Model **rmi-core-v46** follows the earlier [pricing repair](pricing-repair-2026-10-18.md).
The earlier work fixed duplicate event pricing and generated-price feedback but
did not adequately validate the whole engine. Passing implementation tests did
not establish that source interpretation or predictive evaluation was correct.

## Verified defects and corrections

- Lifetime plays/views increasing at a constant pace could supply a permanent
  positive contribution. Last.fm, ListenBrainz and YouTube viewing inputs now use
  measured consumption acceleration; raw lifetime percentage growth and upload
  counts are retained as context, rather than additional price bonuses. Spotify's
  rolling listener count remains a distinct stock measurement.
  Unchanged year-on-year consumption/popularity gaps are context too; they cannot
  supply another daily return when the recent measured pace is steady. Actual
  Spotify follower losses are permitted instead of assuming a monotonic counter.
- Rate denominators used a one-day floor and a 30-day ceiling. This could make
  half a day's normal activity look like a slowdown, or inflate an old interval's
  rate. Rates now use actual elapsed time; intervals shorter than six hours are
  withheld because provider caches make them unstable. Yesterday's completed
  interval is never substituted as today's new evidence. Counter resets are
  withheld instead of being classified as listener rejection.
  Verified track resets still save a new baseline, so a corrected counter does
  not leave a recording excluded indefinitely behind its pre-reset total.
- YouTube public subscribers are rounded down to three significant figures.
  A bin crossing cannot establish precise daily subscriber acquisition. Pricing
  now uses only the change guaranteed by the two rounded ranges, including
  genuine losses. Viewing acceleration and subscriber audience changes remain
  separate. This intentionally favors conservative measurement over apparent
  precision. [YouTube channel statistics](https://developers.google.com/youtube/data/reference/rest/v3/channels)
  documents both rounding and the channel-wide nature of view counts.
- Provider-wide directional breadth alone did not prove a reporting fault, but
  automatic median subtraction could reverse real moves. Broad shifts now remain
  diagnostics; they do not manufacture opposite-direction prices. Old cached
  corrections are restored from their saved raw values. A measured industry-wide
  slowdown can remain a slowdown.
- Correlated YouTube/Spotify endpoints now share a per-metric provider weight
  budget, as well as a provider identity for independent-coverage checks.
  Duplicate provider inputs, non-finite signals and malformed price modifiers
  fail explicitly. Zero-confidence modifiers cannot move a quote. Quality checks
  use contributing provider inputs once, rather than recursively counting copied
  daily caches; tracked-video arrays are no longer omitted from quality traversal.
- YouTube comment signals previously mixed an absolute opinion level with an
  already-calculated change, then the engine differenced that mixture again.
  The source now supplies its absolute reception level for one differencing step.
  Verified cached samples and previous daily reception migrate where possible;
  an unconvertible old baseline is seeded without inventing an upgrade-day move.
  Thin selected fan samples remain confirmation, not a representative poll.
- The operational quality score no longer rewards an up/down mix. Admin UI calls
  it **input health**, explicitly separate from predictive accuracy. No quota
  requires either gainers or decliners.
  Public news also labels its heuristic as an evidence score out of 100, rather
  than presenting it as a calibrated percentage probability of truth.
- Live collectors cannot assign today's source responses to a historical/future
  market session, and mock/manual price signals cannot publish live quotes.
  Malformed request bodies and invalid pricing inputs fail before mutation.
- Last.fm ID lookups now verify the returned ID, or require a near-exact returned
  catalogue name when the ID is absent. A loose contains match or the fact that
  an ID was requested is not proof of artist identity. Conflicting responses can
  try the safe canonical-name lookup; unrelated catalogues never become audience
  observations for a roster artist.

## Corrected validation

The old evaluator calculated log growth of lifetime totals for cumulative metrics.
That can classify steady consumption as slowing merely because the lifetime
denominator grew. It can also manufacture cross-artist rank variation when each
artist's consumption accelerated by the same factor. New PostgreSQL/engine and
mathematical regression fixtures exercise these failures directly.

The evaluator now compares successive consumption rates for cumulative metrics,
keeps rolling Spotify audience growth separate, withholds resets and ambiguous
cached/rounded intervals, and gives each provider one outcome contribution.
Attention-only metrics cannot enter consumption outcomes. It reports balanced
directional accuracy, the same-sample majority-direction benchmark, within-date
rank correlation, and non-overlapping outcome windows. These are diagnostics,
not calibrated confidence probabilities or proof of fair dollar prices.

The default admin scorecard shows the current model. Original daily snapshots
are preserved, while later executed price evidence can supply the correct
model cohort and actual return. A newly deployed model cannot inherit old models'
outcomes. Historical cohorts remain separately selectable.

Rechecking the existing frozen evidence (2,225 samples, 89 artists, 25 dates):

| Diagnostic | Recorded historical returns | Saved v45 shadow returns |
| --- | ---: | ---: |
| Direction agreement | 49.8% | 53.9% |
| Same-sample majority benchmark | 56.4% | 57.0% |
| Balanced direction accuracy | 50.6% | 52.9% |
| Within-date mean rank correlation | 0.070 | 0.074 |
| Non-overlapping outcome windows | 2 | 2 |

These results are **provisional and weak**, not confirmation of a reliable
predictive edge. The earlier 49.5%→56.9% comparison is withdrawn as an accuracy
claim. This recheck is not a v46 replay or prospective evaluation; new v46 outcomes
must mature after deployment. No weights were searched to obtain a desired
artist price, and no hypothetical prices were pasted into history.

## Transactional publication

[Migration 046](../supabase/migrations/046_atomic_market_quotes.sql) installs a
service-role-only PostgreSQL function that commits artist quotes, stats, chart
rows, eligible daily snapshots, ticks, pricing state and completion together.
It locks artist rows, rejects stale collectors using their original quotes,
preserves original daily snapshots during intraday work, and rejects historical
publication. A failed late write rolls the entire publication back. The function
does not accept arbitrary SQL. Execution is revoked from public, anon and
authenticated roles.

The application uses this transaction when installed. During migration rollout,
only an explicitly absent function permits the existing legacy writer; transaction
conflicts, permission failures or unverifiable responses never fall back to partial
writes. `atomicPublication` and a warning identify a legacy publication. Setting
`MARKET_REQUIRE_ATOMIC_QUOTES=true` also forbids the migration-missing fallback.
**Do not call production publication atomic until the migration is installed and
a live result confirms `atomicPublication: true`.** The supplied connection can
write rows but cannot install SQL functions; applying the migration requires SQL
access. No application credential was exposed or broadened to bypass that limit.

PostgreSQL tests execute the real migration in PGlite against table definitions
from this repository. They cover successful publication, complete rollback after
a late constraint failure, stale input rejection, original snapshot preservation,
historical/mismatched batch rejection, and role permissions. This is database
behavior testing, rather than a mock assertion that an RPC was called.

## Limits and preservation

Free public sources have selection, rounding, coverage and reporting delays.
This work makes those limitations explicit and removes verified accounting errors;
it does not establish universal fan sentiment or an objective dollar valuation.
No paid service, Reddit workaround, source-access bypass, historical price reset
or artificial graph movement is part of this change.
