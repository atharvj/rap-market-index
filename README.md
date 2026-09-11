# Rap Market Index

Rap Market Index is a fantasy rapper stock market where users trade artist shares with virtual cash.

Live app: https://rap-market-index.vercel.app/

## Overview

The product is built around a paper-money market for hip-hop fans: users can create an account, build a portfolio, track artist prices, and compete on portfolio performance without real-money trading.

The market engine is designed to react to broad artist momentum, including audience growth, release activity, media movement, and market activity. Price history is stored from real market runs instead of generated as fake backfill.

## Market rule invariants

- Pricing, momentum, news classification, video handling, trading, and data-quality fixes must be implemented as shared rules. Shared behavior must never branch on an artist's ID, name, or ticker.
- Artist-specific data is allowed only where the underlying fact is inherently artist-specific, such as verified provider IDs, safe aliases for ambiguous names, roster presentation, or a source-linked event record.
- A reported artist may be used as a regression fixture, but coverage must also prove the rule across other names, market tiers, or categories when those dimensions could affect behavior.
- Do not rewrite recorded quote history to make a chart look better. Correct the universal model and preserve an auditable boundary between old and corrected model versions.
- Activate a new listing only after its official audience channel and independent artist identity resolve exactly, its configured sources return usable live data, and ambiguous text sources have been excluded or disambiguated.
- A new listing starts with neutral momentum, verified opening observations, and one recorded opening quote. Never invent prelisting movement or positive/negative momentum to make its chart look active.
- Audience valuation uses one fixed logarithmic scale for all listings: Spotify monthly listeners (50%), Last.fm lifetime listeners (18%) and plays (10%), YouTube subscribers (12%) and lifetime views (10%). Missing metrics are omitted and reduce coverage/confidence; publicity is not audience size. The score maps to $8–$140 with exponent 1.6. These are game-design parameters, not estimates of artist revenue or net worth.
- Spotify observations require an exact verified artist URL, matching identity, and the exact displayed monthly-listener count. No rounded search snippets, synthetic histories, access-control workarounds, or missing-as-zero values are accepted. New source IDs can resolve through active MusicBrainz URL relationships.
- An explicit current-date `revalueAudience` daily run requires verified Spotify reach plus independent platform evidence for every requested listing. Its saved same-day boundary makes refreshes idempotent and preserves previous dates and order fills. Normal daily pricing never repeatedly pulls a quote toward a fixed audience target.

## Status

Rap Market Index is in active development.

## Stack

- Next.js 15
- React 19
- Supabase Auth and Postgres
- Tailwind CSS
- Server-side market update jobs

Security issues should be reported privately as described in [`SECURITY.md`](SECURITY.md).
