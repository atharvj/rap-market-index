# Rap Market Index

A fantasy rapper stock market where users trade artist shares with virtual cash. The market engine is designed to price artists from real momentum signals such as audience growth, YouTube activity, release events, news/reviews, and trader demand.

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
- Stored manual review/news/release events

Real graph history starts from persisted Supabase market runs. The app intentionally avoids fake historical price movement unless it is explicitly labeled as estimated backfill.

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` and fill in the Supabase and market job values before using cloud accounts, trading, or persisted market history.

## Docs

- [Supabase setup](docs/supabase-setup.md)
- [Backend roadmap](docs/backend-roadmap.md)
