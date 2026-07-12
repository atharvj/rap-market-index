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
   - `supabase/migrations/009_trade_manipulation_controls.sql`
   - `supabase/migrations/010_trade_order_guardrails.sql`
   - `supabase/migrations/011_curated_artist_roster.sql`
   - `supabase/migrations/012_artist_text_source_defaults.sql`
   - `supabase/migrations/013_price_ticks.sql`
   - `supabase/migrations/014_market_economy_guardrails.sql`
   - `supabase/migrations/015_market_maker_quotes.sql`
   - `supabase/migrations/016_market_integrity_guardrails.sql`
   - `supabase/migrations/017_market_operation_controls.sql`
   - `supabase/migrations/018_short_selling_foundation.sql`
   - `supabase/migrations/019_profile_details.sql`
   - `supabase/migrations/020_profile_avatar.sql`
   - `supabase/migrations/021_profile_avatar_storage.sql`
   - `supabase/migrations/022_account_privacy_and_onboarding.sql`
   - `supabase/migrations/023_admin_user_support.sql`
   - `supabase/seed.sql`

## Configure authentication URLs

In Supabase, open **Authentication -> URL Configuration** and set:

```txt
Site URL: https://rap-market-index.vercel.app
Redirect URLs:
https://rap-market-index.vercel.app/account
https://rap-market-index.vercel.app/account/reset-password
http://localhost:3000/account
http://localhost:3000/account/reset-password
```

Keep the production URL first. The localhost entries are only for local testing. In **Authentication -> Email Templates**, replace the default sender/template branding with RMI copy; the confirmation and recovery links themselves must keep Supabase's `{{ .ConfirmationURL }}` variable.

## Configure the app

Create `.env.local` in the project root and fill in:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MARKET_UPDATE_SECRET=
CRON_SECRET=
ADMIN_EMAILS=
MARKET_IMPACT_EXEMPT_EMAILS=
GROQ_API_KEY=
MARKET_CRON_SOURCE=core
MARKET_CRON_ARTIST_LIMIT=100
MARKET_CRON_MAX_BATCHES=1
MARKET_EVENT_SCAN_LIMIT=20
MARKET_EVENT_SCAN_MAX_RECORDS=12
MARKET_AUTO_HALT_DEATH_EVENTS=true
MARKET_RSS_GOOGLE_NEWS=true
MARKET_RSS_LOOKBACK_DAYS=30
MARKET_RSS_MAX_ITEMS_PER_FEED=40
MARKET_REVIEWER_RSS_FEEDS=
MARKET_YOUTUBE_UPLOAD_EVENT_VIDEOS=12
MARKET_YOUTUBE_UPLOAD_EVENT_DAYS=14
MARKET_YOUTUBE_COMMENT_VIDEOS=0
MARKET_YOUTUBE_COMMENT_LIMIT=25
MARKET_BLUESKY_POST_LIMIT=20
MARKET_BLUESKY_LOOKBACK_DAYS=7
MARKET_BLUESKY_DELAY_MS=250
LASTFM_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
YOUTUBE_API_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
MARKET_REDDIT_POST_LIMIT=25
MARKET_REDDIT_LOOKBACK_DAYS=7
MARKET_REDDIT_SUBREDDITS=hiphopheads,rap,trap,undergroundhiphop,playboicarti,soundcloud
```

Use long random values for `MARKET_UPDATE_SECRET` and `CRON_SECRET`. Set `ADMIN_EMAILS` to the comma-separated email address list allowed to open `/dev`, for example `ADMIN_EMAILS=you@example.com`. Designated operator accounts are excluded from public price impact by default so operational checks cannot move the market; add `MARKET_IMPACT_EXEMPT_EMAILS` only for additional accounts that should not contribute to price demand. New accounts can trade immediately, but migration `016` excludes their first-day orders from public price impact and trade-flow pricing signals. The service role key must stay server-only. `CRON_SECRET` is used by Vercel Cron to trigger the scheduled market update endpoint. `MARKET_CRON_SOURCE=core` runs the production daily market from Last.fm, public attention, YouTube channel stats, public Bluesky social chatter, Reddit community-hype signals if credentials are configured, MusicBrainz release detection, trade flow, and Spotify if credentials are configured. The scheduled job also runs a small free event scan before pricing so news, reviews, releases, tracklists, snippets, controversies, and major public moments can be saved into `market_events`; `MARKET_EVENT_SCAN_LIMIT=20` scans twenty least-recently-scanned artists per day and `MARKET_EVENT_SCAN_LIMIT=0` disables that pre-scan. `MARKET_AUTO_HALT_DEATH_EVENTS=true` means a high-confidence detected artist-death/status event automatically halts that artist for admin review before more trades execute. The event scan uses GDELT, built-in music/media RSS feeds, optional reviewer/video RSS feeds, and optional Google News RSS search. `MARKET_RSS_FEEDS` can override the built-in comma-separated feed list, but can be left unset. `MARKET_REVIEWER_RSS_FEEDS` appends extra reviewer/streamer RSS or YouTube channel RSS feeds without replacing the built-in media list. YouTube upload event detection reads recent official channel uploads without using expensive YouTube search, samples descriptions/thumbnails/statistics, groups multi-track audio drops into a project-level release, and dampens low-reach or short-form uploads; `MARKET_YOUTUBE_UPLOAD_EVENT_VIDEOS=12` samples up to twelve recent uploads per mapped artist and `MARKET_YOUTUBE_UPLOAD_EVENT_VIDEOS=0` disables it. YouTube comment sentiment is off by default; set `MARKET_YOUTUBE_COMMENT_VIDEOS=1` only when you want to spend extra YouTube quota on comments. Bluesky social detection uses the public Bluesky search endpoint, stores aggregate observations only, and classifies snippets, album announcements, tracklists, viral clips, performance reactions, feature/cosign chatter, backlash, controversy, and decline terms into `market_events`; `MARKET_BLUESKY_POST_LIMIT=20`, `MARKET_BLUESKY_LOOKBACK_DAYS=7`, and `MARKET_BLUESKY_DELAY_MS=250` keep it conservative. Reddit community-hype detection uses app-only OAuth, stores aggregate observations only, and can classify snippet, feature, viral performance, release, chart, controversy, and decline posts as events when engagement is strong enough. `MARKET_MODEL_VERSION` can be left unset; the code default is used for the internal audit label saved with market runs and price history. MusicBrainz release detection does not require an API key, but artists need `musicbrainz_id` set in `artist_external_ids`. `LASTFM_API_KEY` is optional, but it enables the free Last.fm listener/playcount market signal adapter. `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are optional, but they enable Spotify artist popularity and follower signals. `YOUTUBE_API_KEY` is optional, but it enables YouTube channel view/subscriber/video-count signals for artists with `youtube_channel_id` set in `artist_external_ids`.

## Verify

Start the app and open:

```txt
http://localhost:3000/dev
```

The Cloud setup panel should show:

- Project URL configured.
- Public anon key configured.
- 55 active artists.
- Watchlist storage configured.
- Market engine storage configured.
- Shorting foundation configured.
- Server service key configured.
- Market job secret configured.
- Admin emails configured.
- Cron secret configured when deployed with Vercel Cron.
- Last.fm API key configured, or listed as optional.
- Spotify credentials configured, or listed as optional.
- User-support storage configured after migration `023`.

Then open:

```txt
http://localhost:3000/account
```

Create an account, buy a small number of shares, refresh the page, and confirm the portfolio stays saved.
