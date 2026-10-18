# Pricing repair — October 18, 2026

Model: **rmi-core-v45**. This implements the corrections identified in the
[89-artist review](price-review-2026-10-18.md), with shared rules for every artist.
No artist receives a hand-picked return or dollar target.

## What changed

- **A story no longer earns a fresh return every day.** Each artist retains a
  dated history of already priced stories in existing observation records. A
  weaker or unchanged repeat has no additional event price effect. Stronger
  verified evidence can consume the additional impact; adverse revisions have a
  separate budget. An actual project release is distinct from its announcement.
  Both event-derived attention/media inputs and direct price modifiers use this
  accounting, so suppressing a bonus cannot leave a duplicate route through news.
- **Upgrading does not replay old headlines.** Existing scored evidence seeds the
  history. Legacy generated album titles are joined to their verified publisher
  headlines before display-title changes. Every same-day recalculation reads the
  same previous-day history. Invalid state fails closed; it is not discarded to
  manufacture another first-time event. Intraday state is saved separately so the original daily signal snapshot stays
  intact and tomorrow also remembers events priced later today. This uses
  existing JSON storage and needs
  no new database table or migration.
- **The model's earlier prices cannot create their own rally or sell-off.**
  Breakout, continuation and reversal bonuses derived from earlier generated
  quotes are removed. Technical context can still reduce a genuinely measured
  move when recent volatility and weak reliability warrant caution. It cannot
  create a direction from a flat signal.
- **Stored hype is not a new measurement.** Prices use fresh source evidence,
  rather than charging yesterday's smoothed hype statistics again. Source
  unavailability alone does not cause an automatic price decay.
- **Confidence cannot cancel itself out.** A lone weak input is shrunk toward
  neutral instead of being divided by its own tiny weight and promoted to full
  strength. Measured-source combinations retain their weighted aggregation.
  The minimum one-cent movement rule also checks the confidence-adjusted evidence.
- **Unchanged selected fan approval/disapproval is not charged repeatedly.**
  YouTube/Bluesky reception contributes changes in the measured source input.
  Its full observed level remains available as context. Reception references
  survive source outages. Reliability, conflict diagnostics and price attribution
  use the same adjusted evidence as pricing, so cooling positive reception can
  be described as cooling without falsely claiming every fan dislikes the artist.
- **Corroboration belongs to a story.** Unrelated articles published on the same
  day do not corroborate one another or multiply each other's impact. Equivalent
  stories retain their observed source identities, while consuming one story's
  price budget. Multiple YouTube uploads remain one provider.
- **Credits and dates are checked consistently.** The collection and stored-event
  gates now share the feature classifier. A real guest credit can remain eligible
  for that guest; financing another artist's record or owning its label does not
  become a solo release. Verified publisher headlines are preserved instead of
  replaced by generated artist/album prefixes. An announcement uses its publication
  date, with the future release date retained separately. A future-dated completed
  event cannot be priced as already having happened.
- **Recovered charts reach pricing.** Apple collection retries transient invalid
  or partial responses while retaining strict complete-feed checks. Intraday
  calculations read newer verified chart observations, so recovery is no longer
  stranded behind the morning's incomplete source cache. Missing countries do not
  create exits or smaller regional totals, and all six feeds remain one provider.
- **Evaluation measures the intended thing.** The scorecard includes Spotify
  monthly listeners and the executed pricing signal, separates model versions,
  and prevents borrowing a future observation as today's baseline. Attention is
  not substituted for consumption in its outcomes. Exact source/metric filtering
  happens before pagination, and oversized results fail explicitly instead of
  silently reporting a truncated evaluation. Older artists' pricing baselines
  cannot be crowded out by another artist's first 1,000 rows.

## Frozen historical replay

The diagnostic replay uses 2,848 saved daily snapshots, 17,351 audience observations
and all 89 artists. It runs 2,670 hypothetical daily calculations from September
19 through October 18, beginning with each artist's recorded September 18 close.
It uses the scored evidence actually present in those historical snapshots, not
newly discovered articles retrospectively assigned to an earlier day. Future-dated
completed-event records are withheld. All recorded modifiers were matched.

This is a sensitivity check, **not a blinded prospective validation or a set of
replacement historical prices**. The replay retains recorded source confidence
and scored provenance; it does not pretend to recover unavailable old publisher
responses or later revisions. The new live classifier has additional safeguards
that the old scored snapshots cannot reconstruct completely.

| Artist | Recorded 30-day change | Diagnostic change with corrected accounting |
| --- | ---: | ---: |
| Drake | +35.78% | +4.62% |
| Quavo | +15.70% | +9.01% |
| Ye | +0.68% | -0.36% |
| Tezzus | +35.39% | +26.41% |
| Doechii | +6.10% | +2.83% |
| Sosocamo | +12.00% | +5.94% |

All hypothetical prices stayed finite and positive. There were 1,078 increases,
1,536 decreases and 56 unchanged daily calculations. The largest absolute daily
move was about 3.14%; no noise was added to make charts look busy.

The seven-day audience-acceleration comparison has 2,225 matched samples over 25
signal dates, using the evaluator's existing two-day outcome-date tolerance:

| Diagnostic | Recorded model | Corrected candidate |
| --- | ---: | ---: |
| Direction match on nontrivial samples | 49.5% (863 samples) | 56.9% (861 samples) |
| Rank correlation | 0.036 | 0.077 |

The correlation is still weak. These results support removing duplicate charges
and feedback; they do **not** prove exact fair dollar values or representative fan
sentiment. Subsequent observations must evaluate v45 separately from old versions.
No weights were selected by searching for a desired return for a particular artist.

## Operational verification

- The existing production build passes, along with regression checks for repeated
  stories, stronger evidence, adverse revisions, model-upgrade migration, actual
  release versus announcement, corrupted state, weak confidence, stable reception,
  older baselines, featured artists, future dates and recovered charts.
- An all-artist preflight through the production API path succeeded without writing
  prices: 89 artists, 30 increases, 52 decreases and 7 essentially flat moves. Exact
  numbers can change with later source observations and the final chart recovery.
- Current-session quotes are recalculated using their recorded previous close.
  The hypothetical replay endings are not pasted into production. Original daily
  closes, older graphs, holdings and transaction records are preserved.
- Existing free sources remain in use. Reddit remains disabled; no paid provider,
  purchase, account application or access workaround was added.
