# Supabase Setup

Rap Market Index uses Supabase for cloud accounts, saved portfolios, trades, market history, and daily update data.

## Create the project

1. Create a new Supabase project.
2. Open the SQL editor.
3. Run these files in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_trading_functions.sql`
   - `supabase/migrations/003_harden_rpc_access.sql`
   - `supabase/migrations/004_continuous_market.sql`
   - `supabase/migrations/005_watchlist.sql`
   - `supabase/migrations/006_market_engine.sql`
   - `supabase/migrations/007_market_events.sql`
   - `supabase/migrations/008_market_model_version.sql`
   - `supabase/seed.sql`

## Configure the app

Create `.env.local` from `.env.example` and fill in:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MARKET_UPDATE_SECRET=
CRON_SECRET=
MARKET_CRON_SOURCE=core
MARKET_CRON_ARTIST_LIMIT=25
MARKET_CRON_MAX_BATCHES=4
MARKET_MODEL_VERSION=rmi-core-v1
LASTFM_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
YOUTUBE_API_KEY=
```

Use long random values for `MARKET_UPDATE_SECRET` and `CRON_SECRET`. The service role key must stay server-only. `CRON_SECRET` is used by Vercel Cron to trigger the scheduled market update endpoint. `MARKET_CRON_SOURCE=core` runs the production daily market from Last.fm, YouTube channel stats, YouTube comments, MusicBrainz release detection, and Spotify if credentials are configured. `MARKET_MODEL_VERSION` is an internal audit label saved with market runs and price history; keep it at `rmi-core-v1` until the pricing algorithm materially changes. MusicBrainz release detection does not require an API key, but artists need `musicbrainz_id` set in `artist_external_ids`. `LASTFM_API_KEY` is optional, but it enables the free Last.fm listener/playcount market signal adapter. `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are optional, but they enable Spotify artist popularity and follower signals. `YOUTUBE_API_KEY` is optional, but it enables YouTube channel view/subscriber/video-count and comment-reaction signals for artists with `youtube_channel_id` set in `artist_external_ids`.

## Verify

Start the app and open:

```txt
http://localhost:3000/dev
```

The Cloud setup panel should show:

- Project URL configured.
- Public anon key configured.
- 10 active artists.
- Watchlist storage configured.
- Market engine storage configured.
- Server service key configured.
- Market job secret configured.
- Cron secret configured when deployed with Vercel Cron.
- Last.fm API key configured, or listed as optional.
- Spotify credentials configured, or listed as optional.

Then open:

```txt
http://localhost:3000/account
```

Create an account, buy a small number of shares, refresh the page, and confirm the portfolio stays saved.
