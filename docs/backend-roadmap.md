# Rap Market Index Backend Roadmap

This app still runs in development with unsaved demo data, but the backend foundation is now shaped around Supabase, cloud accounts, continuous portfolios, and a server-side daily market update job.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql`.
3. Run `supabase/migrations/002_trading_functions.sql`.
4. Run `supabase/migrations/003_harden_rpc_access.sql`.
5. Run `supabase/migrations/004_continuous_market.sql`.
6. Run `supabase/migrations/005_watchlist.sql`.
7. Run `supabase/migrations/006_market_engine.sql`.
8. Run `supabase/migrations/007_market_events.sql`.
9. Run `supabase/migrations/008_market_model_version.sql`.
10. Run `supabase/migrations/009_trade_manipulation_controls.sql`.
11. Run `supabase/migrations/010_trade_order_guardrails.sql`.
12. Run `supabase/seed.sql` for the starter artists.
13. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MARKET_UPDATE_SECRET`
   - `CRON_SECRET`
   - `MARKET_CRON_SOURCE=core`
   - `MARKET_CRON_ARTIST_LIMIT=25`
   - `MARKET_CRON_MAX_BATCHES=4`
   - `MARKET_MODEL_VERSION=rmi-core-v1`
   - `LASTFM_API_KEY` for optional Last.fm listener/playcount signals
   - `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for optional Spotify popularity/follower signals
   - `YOUTUBE_API_KEY` for optional YouTube channel view/subscriber/video-count and comment-reaction signals

The setup status endpoint is:

```txt
GET /api/system/cloud-status
```

The Dev console shows these checks at:

```txt
/dev
```

## Artist source IDs

Real adapters are only as accurate as their artist matching. Store official external IDs in `artist_external_ids` before relying on Spotify or YouTube signals at scale.

Use the admin source-ID endpoint to inspect existing mappings:

```txt
GET /api/admin/artist-source-ids
```

Use a dry-run payload to validate a batch without writing:

```txt
POST /api/admin/artist-source-ids
```

```json
{
  "dryRun": true,
  "records": [
    {
      "ticker": "CARTI",
      "spotifyId": "699OTQXzgjhIYAHMy9RyPD",
      "youtubeChannelId": "UC652oRUvX1onwrrZ8ADJRPw",
      "lastfmName": "Playboi Carti",
      "gdeltQuery": "\"Playboi Carti\" rapper OR \"Playboi Carti\" music"
    }
  ]
}
```

When the dry run is valid, send the same body with `"dryRun": false` and the `x-market-update-secret` header. The endpoint accepts either `artistId` or `ticker`, preserves existing fields you omit, and allows `null` or an empty string to clear a source ID.

To generate candidate IDs instead of finding them manually, use the protected resolver endpoint:

```txt
POST /api/admin/artist-source-resolver
```

with `x-market-update-secret` and a body like:

```json
{
  "dryRun": true,
  "artistLimit": 5,
  "artistOffset": 0,
  "sources": ["spotify", "youtube", "musicbrainz"],
  "minConfidence": 0.88
}
```

The resolver searches configured sources, ranks candidates by confidence, and returns proposed `artist_external_ids` records. It only persists proposed high-confidence records when `"dryRun": false`. Spotify candidate search requires `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`; YouTube candidate search requires `YOUTUBE_API_KEY`; MusicBrainz can run without a key but should be batched politely.

## Market health

Use the admin health endpoint to check whether the engine has enough mapped artists and fresh data:

```txt
GET /api/admin/market-health
```

It reports active artist count, source-ID coverage, observation freshness by source/metric, fresh price-history coverage, recent market update runs, and warnings such as missing Spotify/YouTube credentials. Query params:

- `lookbackDays`: defaults to `30`
- `freshnessDays`: defaults to `2`
- `runDate`: defaults to today

This is the fastest way to see whether the market is ready for a real blended run or whether it is still missing IDs/baselines.

## Go-live checklist

For local testing, the market engine is up when `/api/admin/market-health` shows:

- `readyForAdminWrites: true`
- fresh price history coverage
- fresh Last.fm and YouTube observations
- a successful `core` market run

For production, add these environment variables to the deployment host before relying on automatic daily updates:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MARKET_UPDATE_SECRET`
- `CRON_SECRET`
- `LASTFM_API_KEY`
- `YOUTUBE_API_KEY`
- optional `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`

After deployment, manually call `/api/cron/daily-market-update?dryRun=1` with `Authorization: Bearer <CRON_SECRET>` once. Then run one persisted `core` batch and recheck `/api/admin/market-health`. From that point forward, Vercel Cron can keep the graph history growing each day.

`MARKET_MODEL_VERSION` is an internal audit label, not a prominent user-facing product label. It is saved on market runs, signal snapshots, and price-history rows so future algorithm changes can be traced without rewriting historical prices. Normal market pages should keep broad language such as audience momentum, market activity, release signals, and media movement. Admin/health/debug views can show the exact model version.

## Trading integrity controls

User trades should contribute to the market, but they should not overpower the real artist-momentum model. The current backend uses layered controls:

- Immediate buy/sell impact is only a small quote nudge with capped same-direction movement.
- Daily trade-flow demand is discounted when activity lacks trader breadth or is heavily concentrated.
- Trading RPCs enforce position sizing, rolling buy limits, and same-artist order cooldowns.

This keeps the product closer to an HSX-style market where trading activity matters, while the durable price trend is still driven by audience growth, video activity, releases, news/reviews, and other external signals. If the market eventually adds public leaderboards or leagues, add account-level abuse checks before prizes, payouts, or season winners matter.

## Daily update flow

The backend update endpoint is:

```txt
POST /api/admin/daily-market-update
```

For a dry run from the dev console, the endpoint returns calculated price moves without touching Supabase.

The first real source path is:

```json
{
  "dryRun": true,
  "source": "gdelt",
  "artistLimit": 1
}
```

That path queries GDELT news coverage, stores article-count/source/tone observations when persisted, and converts those observations into search, social, and news signals. It also classifies high-confidence articles into market events such as reviews, controversies, tour announcements, awards, viral moments, and release news. `artistLimit` is dry-run only and is useful because GDELT asks high-traffic users to keep requests slow; the adapter also records request errors instead of crashing the market job.

The first free audience-demand path is:

```json
{
  "dryRun": true,
  "source": "lastfm",
  "artistLimit": 1
}
```

That path uses Last.fm artist listeners and playcount as a proxy for audience demand. It stores raw counts first, then only moves price from Last.fm after there is a previous baseline to compare against. This keeps a large artist from jumping just because they already have a large audience.

If a real source only collects a baseline, or if a source request fails, the price engine now marks `hasMomentumSignal: false` and holds price flat for that run. This prevents stale demo stats from creating fake market movement while the engine is still building source history.

The combined source path is:

```json
{
  "dryRun": true,
  "source": "blended",
  "artistLimit": 1,
  "artistOffset": 0
}
```

That combines GDELT coverage, Last.fm audience momentum, Spotify popularity/follower momentum, YouTube channel momentum, YouTube comment reaction, MusicBrainz release detection, and the market event/review layer. If optional source credentials are missing, the job returns a warning and skips that source instead of failing the whole dry run.

The production daily source is:

```json
{
  "dryRun": false,
  "source": "core",
  "artistLimit": 25,
  "artistOffset": 0
}
```

`core` combines Last.fm, YouTube channel stats, YouTube comments, MusicBrainz release detection, trade-flow demand, and Spotify when Spotify credentials are configured. It intentionally skips GDELT because the free news endpoint can be slow or rate-limited. Use `blended` when you intentionally want to include GDELT/news in a supervised run.

The YouTube path also samples recent comments from each artist's official channel. It stores aggregate observations only:

- `youtube_comments:comment_sentiment`
- `youtube_comments:comment_count`
- `youtube_comments:comment_like_count`
- `youtube_comments:positive_comment_share`
- `youtube_comments:negative_comment_share`

Raw comment text is not saved. The first run is treated as a baseline; later runs move the social/news/search parts of the model from changes in sentiment, likes, and net positive-vs-negative share. This prevents every naturally positive fan comment section from pushing a stock up every day.

The `core` and `blended` paths also detect recent MusicBrainz release groups for artists with `musicbrainz_id` set. The detector stores confirmed releases as `market_events` with `eventType: "release"`, then lets the existing event/review layer apply decay, confidence, and price-shock caps. It only accepts full `YYYY-MM-DD` release dates and filters compilation/live/catalog-style records so vague metadata does not move the market.

The `gdelt` and `blended` paths can also create article-based market events. This detector is intentionally conservative: it requires the title to mention the artist, only treats reviews as reviews when the title has review/rating language, weighs trusted music/business/news domains higher, and limits detected events to the strongest few articles per artist per run.

Real-source market runs also include trade flow from saved buy/sell transactions. Individual trades already apply a small immediate market-maker impact; the daily trade-flow adapter summarizes the previous day's net buy-vs-sell order value, trade count, and trader breadth into the `traderDemand` model input. Trade-flow observations are included in the admin health endpoint so the operator can verify whether real trading demand is being measured.

The update endpoint is batch-aware for a larger artist universe:

- `artistLimit` caps a single request at 100 artists.
- `artistOffset` starts the batch from a later point in the ticker-sorted artist list.
- Persisted real-source runs default to 50 artists per request when no limit is supplied.
- The response includes `batch.hasMore` and `batch.nextOffset`, so a scheduler can keep running the next batch without rereading every artist.

Example persisted batch:

```json
{
  "dryRun": false,
  "source": "blended",
  "artistLimit": 50,
  "artistOffset": 0
}
```

For scheduler-style execution, call the protected batch runner:

```txt
POST /api/admin/market-batch-run
```

with the same `x-market-update-secret` header and a body like:

```json
{
  "dryRun": false,
  "source": "lastfm",
  "artistLimit": 50,
  "artistOffset": 0,
  "maxBatches": 5
}
```

The runner calls the daily update endpoint repeatedly, follows `batch.nextOffset`, and returns `hasMore`/`nextOffset` if more artists remain. `maxBatches` is capped at 10 per request so a scheduler cannot accidentally launch a huge free-API run. After a persisted multi-batch run finishes, it rewrites the `market_update_runs.summary` row with an aggregate summary across all completed chunks: total artists processed, weighted average move, weighted signal delta, total source coverage, and top gainer/loser across the entire run. Daily run summaries include `momentumArtistCount`, `averageSignalDelta`, and `signalSourceCoverage` so an admin can see whether a run actually had confirmed signal inputs or only collected baselines.

## Scheduled market history

The project includes a Vercel Cron endpoint:

```txt
GET /api/cron/daily-market-update
```

`vercel.json` schedules it once daily:

```json
{
  "path": "/api/cron/daily-market-update",
  "schedule": "0 9 * * *"
}
```

Vercel schedules cron in UTC, so this runs around 2 AM Pacific during daylight saving time. Hobby accounts support once-daily cron jobs, with per-hour scheduling precision. The route verifies `Authorization: Bearer <CRON_SECRET>`, then calls the protected batch runner with:

- `source`: `MARKET_CRON_SOURCE`, default `core`
- `artistLimit`: `MARKET_CRON_ARTIST_LIMIT`, default `25`
- `maxBatches`: `MARKET_CRON_MAX_BATCHES`, default `4`

The route skips duplicate same-day runs when a successful or running `core` run already exists. This matters because cron delivery is best-effort and can occasionally miss or duplicate invocations. For manual local testing, call the cron route with `x-market-update-secret: <MARKET_UPDATE_SECRET>`. Add `?dryRun=1` to exercise the full path without persisting another market run.

The market event layer stores releases, reviews, news, controversies, awards, tour announcements, and viral moments. These events can adjust the final price movement after raw momentum is calculated, so a stream spike with weak reviews can still rise, but by less than a stream spike with strong reviews.

Blended market runs use a confidence-weighted ensemble. Each adapter contributes most strongly to the stats it actually measures: Last.fm to streaming momentum, YouTube channel stats to video momentum, YouTube comments to fan/social reaction, GDELT to news/search, Spotify to streaming/search proxies, trade flow to trading demand, and market events to release/news/social modifiers. This keeps the result from depending on adapter order and makes weak or indirect inputs less dominant.

The admin event ingestion endpoint is:

```txt
POST /api/admin/market-events
```

with the header:

```txt
x-market-update-secret: <MARKET_UPDATE_SECRET>
```

and a body like:

```json
{
  "events": [
    {
      "artistId": "playboi-carti",
      "eventType": "review",
      "eventDate": "2026-07-04",
      "title": "Poor critical reception",
      "sourceName": "Manual desk",
      "sentimentScore": -85,
      "impactScore": -75,
      "confidence": 0.95
    }
  ]
}
```

Those events are saved and then loaded by future market update runs. A non-dry-run `POST /api/admin/daily-market-update` can also include `manualEvents`; those submitted events are persisted and used in the same calculation.

Example dry-run shape for testing that behavior:

```json
{
  "dryRun": true,
  "source": "manual",
  "artistLimit": 1,
  "manualSignals": {
    "playboi-carti": {
      "streamingGrowth": 70,
      "youtubeGrowth": 55,
      "searchGrowth": 80,
      "socialGrowth": 90,
      "newsScore": 72,
      "traderDemand": 20
    }
  },
  "manualEvents": {
    "playboi-carti": [
      {
        "eventType": "release",
        "eventDate": "2026-07-04",
        "title": "Album release spike",
        "sentimentScore": 20,
        "impactScore": 60,
        "confidence": 0.95
      },
      {
        "eventType": "review",
        "eventDate": "2026-07-04",
        "title": "Poor critical reception",
        "sentimentScore": -85,
        "impactScore": -75,
        "confidence": 0.95
      }
    ]
  }
}
```

For a persisted update, send:

```json
{
  "dryRun": false,
  "source": "mock"
}
```

with the header:

```txt
x-market-update-secret: <MARKET_UPDATE_SECRET>
```

The job:

1. Loads active artists.
2. Collects market signals.
3. Calculates the new hype score and price.
4. Applies category volatility and daily movement caps.
5. Saves artist prices, stats, signal snapshots, price history, and a market update run record.

## Market history

Real price history starts when the backend begins persisting `price_history` rows. The general market snapshot only carries a short recent history for each artist so the homepage stays fast with a large artist universe. Full chart ranges are loaded on demand from:

```txt
GET /api/market/history/:artistId?range=1M
```

Supported ranges are `1M`, `3M`, `6M`, `1Y`, and `ALL`. The artist detail page uses this endpoint for its graph range controls.

Historical backfill depends on the source:

- Last.fm `artist.getInfo` gives current listener/playcount totals, not reliable daily history. It is useful from the day we start tracking.
- Spotify artist popularity and followers are mostly current snapshots unless we use a separate historical provider or have already been collecting them.
- YouTube channel statistics are current snapshots. They become useful for charts and price movement once the app has collected daily observations for each artist's official channel.
- GDELT can be queried historically by date window, so it is a realistic free candidate for backfilling news/article momentum.
- Billboard, airplay, chart, and SoundCloud historical data depend on access terms and available APIs/scrapers.

For launch, the honest product behavior should be "since listing" until enough real observations have accumulated. If we generate pre-launch history, it should be labeled as backfilled/model-estimated rather than pretending it was live market data.

## Signal adapters

- GDELT news coverage adapter.
- GDELT article-to-event detector for reviews/news/controversies.
- Last.fm listener/playcount momentum adapter.
- Spotify artist popularity/follower momentum adapter.
- YouTube channel view/subscriber/video-count momentum adapter.
- YouTube comment-reaction adapter.
- MusicBrainz release-event detector.
- Market event/review quality modifier.
- Chart/streaming momentum adapter.
- Search/social trend adapter.
- Manual review/release/news event adapter.
- Trader demand adapter from real buy/sell transaction volume.

The important thing is that every adapter returns normalized momentum values, not raw popularity counts.

The YouTube channel-stat adapter intentionally uses `artist_external_ids.youtube_channel_id` instead of broad search during market runs. `channels.list` can fetch up to 50 channel IDs cheaply in one request, while search is expensive and can match unofficial fan or label channels. For a large artist universe, seed exact official channel IDs before relying on YouTube as a price input.

The YouTube comment adapter uses the channel's uploads playlist, samples a small number of recent official videos, and calls `commentThreads.list` for each sampled video. Keep `artistLimit`, `maxBatches`, and scheduler frequency conservative so a large market does not burn the free daily quota on comments. The current implementation defaults to two recent videos and 50 top-level comments per video.

The MusicBrainz release detector uses the public MusicBrainz web service and follows its one-request-per-second expectation. Keep daily batches modest when the artist universe grows; the current Vercel cron defaults to 25 artists per batch and four batches per day.

## Trading flow

The real backend trading path is prepared through database functions:

- `public.buy_artist_shares(artist_id, shares)`
- `public.sell_artist_shares(artist_id, shares)`

The app-facing API route is:

```txt
POST /api/trades
```

It expects a Supabase-authenticated `Authorization` header and a body like:

```json
{
  "side": "buy",
  "artistId": "drake",
  "shares": 10
}
```

The database function handles the important atomic work: cash balance, holdings, average buy price, transaction record, trading demand, and small market-maker price impact.

## Frontend bridge

The app can now ask for a server-side market snapshot:

```txt
GET /api/market/snapshot
```

Without Supabase credentials, it returns the demo market in memory. With Supabase configured, it returns active artists, stats, and price history from the database.

## Auth/profile bridge

The app has an account page at:

```txt
/account
```

When Supabase is configured, the client uses Supabase Auth directly. After sign-in, the game calls:

```txt
POST /api/profile/bootstrap
```

That route creates or loads the player profile and returns the user's cash balance, holdings, and recent transactions. Until Supabase is configured, the app remains in unsaved demo mode.
