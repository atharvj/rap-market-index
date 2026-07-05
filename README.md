# Rap Market Index

A fantasy rapper stock market where users trade artist shares with virtual cash. The market engine is designed to price artists from real momentum signals such as audience growth, video activity, release events, news/reviews, and trading demand.

## Current Stack

- Next.js 15
- React 19
- Supabase Auth and Postgres
- Tailwind CSS
- Server-side market update jobs

## Market Engine

The current production daily source is `core`, which combines:

- Last.fm listener/playcount momentum
- YouTube channel view/subscriber/video-count momentum
- YouTube comment reaction aggregates
- MusicBrainz release-event detection
- Optional Spotify artist popularity/follower signals
- Stored and detected review/news/release events
- Trading demand from buy/sell order flow

Real graph history starts from persisted Supabase market runs. The app intentionally avoids fake historical price movement unless it is explicitly labeled as estimated backfill.

## Getting The Market Running

Local manual runs work when `.env.local` has Supabase admin credentials, `MARKET_UPDATE_SECRET`, `LASTFM_API_KEY`, and `YOUTUBE_API_KEY`. Production scheduled runs also need `CRON_SECRET` set in the deployment environment.

Use this endpoint to check readiness:

```txt
GET /api/admin/market-health
```

When health shows fresh price history and fresh source observations, the graphs are being fed by persisted market data.

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` and fill in the Supabase and market job values before using cloud accounts, trading, or persisted market history.

## Docs

- [Supabase setup](docs/supabase-setup.md)
- [Backend roadmap](docs/backend-roadmap.md)
