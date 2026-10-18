# Launch readiness and valuation correction — October 18, 2026

## Quote baseline

The prior engine accumulated repeated headline effects and generated-price
feedback. Fixing future evidence accounting did not remove those effects from
current price levels. Archived daily inputs cannot reproduce every intervening
intraday quote, so a purported exact reversal would overstate the available proof.

This release uses the existing version-2 audience valuation rule once across the
whole active roster, with fresh identity-checked Spotify, Last.fm and YouTube
inputs. It then applies current evidence using the corrected engine. No artist
name has a special target; no old shadow-replay prices are substituted. The source
scales, weights and valuation function are unchanged. This establishes a common
fantasy-index baseline, not an empirically proven fair dollar price.

The first live-data preview covered all 89 artists, each with three audience
platforms. Illustrative preview quotes: Drake $138.35, Tezzus $42.52, Ye $131.99,
Quavo $94.62 and Young Thug $110.95. Final live quotes may differ as sources refresh.
Normal daily movements resume from the new baseline; the anchor is not reapplied
as a daily return or a continual mean-reversion force.

Migration 047 stores each correction in a permanent private ledger inside the
same transaction as prices, history, ticks, pricing state and completion. The
correction time exactly matches the publication tick. Subsequent updates must
retain the existing boundary and cannot replace it or silently omit it. Browser
roles cannot read or write the ledger; service-role direct writes are also denied.
Legacy correction records remain readable without being applied twice.

The correction runs intraday so the original daily signal snapshot remains
unchanged. Earlier prices and executed trades are preserved. One continuous graph
uses the saved correction boundary to keep earlier movements on the current
valuation scale. The site identifies the correction so its effect on daily returns
and portfolio values is not mistaken for fan reaction. Correction-day returns are
excluded from predictive-validation samples. The new cohort is rmi-core-v47.

PostgreSQL regression tests cover successful persistence, repeat publication,
conflicting/omitted corrections, permissions and rollback after a later evidence
failure. The actual all-89 preview payload also passed through the application
writer into PostgreSQL with 89 coherent quotes and 89 permanent correction records.

## Account access

Public Supabase settings confirm Google and email authentication are enabled and
signups are permitted. Google authorization redirects to accounts.google.com.
New-account UI uses Google; existing email users retain password login and recovery.
No actual email was sent or external account created during verification.

Signup now states the $25,000 fantasy starting balance and the requested Google
profile fields. Help text matches this flow. Failed session restoration returns
to sign-in, and rejected sign-in/Google requests release their loading state.
Browser tests cover signup/login copy, failed verification and the public correction
notice. A full external Google sign-in still requires the person's Google account.
