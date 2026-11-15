# News relevance and status-attribution repair

The live feed was audited against publisher pages and stored classification
evidence. This release changes editorial eligibility and semantic classification;
the existing site design, valuation scale and recorded charts are retained.

## Decisions

| Story | Decision |
| --- | --- |
| [J. Cole sample-credit obituary](https://www.vice.com/en/article/disco-legend-whose-music-was-covered-by-mary-j-blige-and-sampled-by-j-cole-dead-at-72/) | Incidental credit; exclude from his catalysts and status evidence. |
| [Drake chart-policy reaction](https://www.complex.com/music/a/markelibert/drake-billboard-youtube-chart-change-reaction) | Industry commentary; no demonstrated artist-specific consumption result. |
| [Lil Baby signed-copy promotion](https://www.complex.com/music/a/complexstaff3/lil-baby-signed-fresh-album-and-merch) | Commerce promotion, not independent release evidence. |
| [Lil Baby listening reaction](https://www.hotnewhiphop.com/1016375-joe-budden-lil-baby-album-fresh) | A bounded negative opinion, not a release boost or fan consensus. |
| BigXthaPlug chart-result report | A concrete music outcome remains eligible. |
| New music and documented performances | Remain eligible; related recording coverage should not crowd out other artists. |

## Root causes and changes

- A sample-credit artist immediately before “dead” passed the old direct-subject
  check. This made the obituary a J. Cole death event and created an automatic
  trading halt. Sample/cover/remix credit objects now fail status attribution.
  Halt recommendations independently require the artist to be the actual status
  subject; the scanner also validates source integrity before applying them.
- Shared contextual exclusions remove shopping promotions and chart-policy
  commentary from collection, public news and future price evidence, including
  existing stored rows. These rules apply to all artists/publishers, without a
  blacklist of article URLs. Measured chart and sales outcomes remain distinct.
- Listening reactions are classified before release keywords, with opinion
  impact bounded to ±18. Neutral listening produces no directional score. Old
  release-tagged listening stories are normalized on read without rewriting the
  original record. Negative chart outcomes cannot become positive new-song news.
- Public and pricing readers use the same stored-media classifier. Corrected
  listening reviews appear on artist feeds and their review filter, and are
  excluded from release filters. One critic's opinion is insufficient for the
  global featured-catalyst threshold.
- Featured selection suppresses repeated coverage of the same named recording
  across credited artists. Artist attribution and price-event grouping are
  unchanged by this display rule. A later video release remains a separate event.
- Vague album teases receive lower featured-ranking weight than completed releases.
  Reactions to lineups an artist is not on cannot become performance/feature gains.
- Pricing engine version advances to `rmi-core-v48` to identify the changed
  evidence rules. Numerical price coefficients and stored prices are unchanged.

## Verification and operational correction

828 unit/security tests across 127 files and type checking passed locally,
including public-API filtering and price-signal tests. Production build, release
CI and live checks are recorded in the parent workspace's `RMI_HANDOFF.md`.

The active-halt audit found only the misattributed J. Cole restriction. It was
cleared on November 14 at 6:59 p.m. Central after the source fix deployed. The
conditional update matched the exact erroneous reason and last-update timestamp.
It retained the row, ended the halt and preserved its original reason with the
resolution. The original row was also backed up locally. No other controls changed.
No quotes, portfolio balances, execution prices or graph history are reset.
