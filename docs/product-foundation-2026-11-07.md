# Pricing clarity, first-time play and personal reviews

Scope: the user selected recommendations 1, 2 and 4 from the HSX comparison.
Private leagues remain deferred. No pricing weights, existing quotes, history,
execution prices or portfolios are reset by this release. No paid data is added.

## Product behavior

- `/methodology` explains audience valuation, normalized inputs, reception,
  source verification, event decay, publication and correction policy. Its score
  and base price coefficients come directly from the engine's shared constants.
  It distinguishes score contributions from final quote-return attribution.
- Each artist has a quote explanation with links to dated indicators, relevant
  news and the rules. Model-update metadata comes from actual completion records,
  rather than assigning the currently deployed version to every historical quote.
- Guests immediately see the game, the existing $25,000 starting balance and
  signup/rules links, independently of the quote request. Real quote surfaces
  still wait for verified market data; bundled seed prices are not substituted.
- Onboarding offers an optional first-trade review for a selected artist or a
  direct route to the dashboard. The guided ticket starts with a small whole-share
  quantity meeting the minimum notional. Opening it never submits an order.
- The signed-in homepage shows the owner's current portfolio, quote changes for
  followed/held artists, relevant stories, dated announcements and latest trades.
  Long and short positions both count as tracked artists. Unknown IDs do not.
- Artist returns use canonical recorded prices, actual dates and up to seven days
  of available history. Missing weeks do not become invented performance, and
  old recorded prices on a prior valuation scale do not create a fake recap gain.
  This is artist quote performance, not reconstructed weekly portfolio P/L.
- Sharing is an explicit clipboard action with a manual-copy fallback. The recap
  contains public artist performance and dates, never private balances, holdings,
  trade fills, email addresses or usernames. Nothing is posted or emailed.
- Upcoming dates are limited to the next 14 days in the user's recent stories.
  They require verified publisher evidence and matching project/release/date
  wording. Unrelated festival dates, rumors, delays, invalid years and unverified
  sources are withheld. This is not an exhaustive release-calendar claim.

## Reliability and privacy

The personal view waits for the matching account's profile and watchlist. Account
switches clear its local content. Header identity and portfolio values require a
matching loaded profile. Older news requests cannot replace newer results, and
background failures preserve the last good stories. Watchlist reads time out,
preserve last-known choices on failure and cannot undo a newer write. A delayed
write from a previous account cannot populate the new account's personal view.
Public operational warning banners remain removed; functional form/order errors
and neutral empty states remain usable.

## Verification

- 825 unit/security tests across 128 files passed, including new date, recap,
  release-provenance and actual-publication-metadata coverage.
- All 47 browser/authorization checks passed against the optimized production
  build on isolated port 3106. They
  include delayed quotes, signup access, first-trade review without an order,
  clipboard fallback, personal filtering, failed-save retry, watchlist response races, account
  switching, existing graph behavior and mobile overflow.
- Type checking and the production build passed; the dependency audit reported
  zero vulnerabilities. The new guest-home baseline and desktop/mobile, dark/light
  personal views were inspected. The previous homepage baseline was replaced.
- Release CI, deployment and live public-market evidence are recorded in the
  parent workspace's `RMI_HANDOFF.md`. No real user account or order is used by
  the browser fixtures.

These changes improve inspectability and usability. They do not establish that a
fantasy quote is an objectively correct dollar valuation, or that every fan's
opinion has been measured. Existing outcome evaluation remains separate.
