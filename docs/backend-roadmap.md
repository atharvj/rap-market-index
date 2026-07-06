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
12. Run `supabase/migrations/011_curated_artist_roster.sql`.
13. Run `supabase/migrations/012_artist_text_source_defaults.sql`.
14. Run `supabase/migrations/013_price_ticks.sql`.
15. Run `supabase/migrations/014_market_economy_guardrails.sql`.
16. Run `supabase/migrations/015_market_maker_quotes.sql`.
17. Run `supabase/migrations/016_market_integrity_guardrails.sql`.
18. Run `supabase/migrations/017_market_operation_controls.sql`.
19. Run `supabase/migrations/018_short_selling_foundation.sql`.
17. Run `supabase/seed.sql` for the starter artists.
18. Create `.env.local` in the project root and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MARKET_UPDATE_SECRET`
   - `CRON_SECRET`
   - `MARKET_CRON_SOURCE=core`
   - `MARKET_CRON_ARTIST_LIMIT=100`
   - `MARKET_CRON_MAX_BATCHES=1`
   - `MARKET_EVENT_SCAN_LIMIT=20`
   - `MARKET_EVENT_SCAN_MAX_RECORDS=12`
   - `MARKET_AUTO_HALT_DEATH_EVENTS=true`
   - `MARKET_YOUTUBE_UPLOAD_EVENT_VIDEOS=5`
   - `MARKET_YOUTUBE_UPLOAD_EVENT_DAYS=14`
   - `MARKET_YOUTUBE_COMMENT_VIDEOS=0`
   - `MARKET_YOUTUBE_COMMENT_LIMIT=25`
   - `MARKET_BLUESKY_POST_LIMIT=20`
   - `MARKET_BLUESKY_LOOKBACK_DAYS=7`
   - `MARKET_BLUESKY_DELAY_MS=250`
   - `ADMIN_EMAILS=<comma-separated admin emails>`
   - `MARKET_MODEL_VERSION=rmi-core-v13`
   - `LASTFM_API_KEY` for optional Last.fm listener/playcount signals
   - `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for optional Spotify popularity/follower signals
   - `YOUTUBE_API_KEY` for optional YouTube channel view/subscriber/video-count and comment-reaction signals
   - `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `REDDIT_USER_AGENT` for optional Reddit community-hype signals

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

Artist roster changes should be done through `/dev` -> `Artist roster`, not by creating a new migration for every artist. The admin roster tool can add/update an artist and toggle an unreliable listing inactive while preserving historical rows.

The preferred admin workflow is `/dev` -> `Manual source IDs`, where one artist can be reviewed and updated without touching raw JSON. YouTube manual entries accept a `UC...` channel ID, a `youtube.com/channel/UC...` URL, an `@handle`, or a `youtube.com/@handle` URL. Handle inputs are resolved to a channel ID through the YouTube Data API before saving.

Market runs also apply source-identity confidence checks before letting external audience stats affect prices. Stored exact IDs such as Spotify artist IDs and MusicBrainz IDs are treated as trusted source mappings; name-search fallbacks must pass stricter artist-name matching, especially for short or ambiguous names such as `Ye`, `Che`, `Ian`, or `Tana`. Weak matches are recorded as request/source errors or ignored for observations instead of poisoning baselines.

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

When the dry run is valid, send the same body with `"dryRun": false` using either a signed-in admin session or the `x-market-update-secret` header. The endpoint accepts either `artistId` or `ticker`, preserves existing fields you omit, and allows `null` or an empty string to clear a source ID.

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
  "minConfidence": 0.88,
  "prioritizeMissing": true
}
```

The resolver fills safe text defaults for audience/news search fields, then searches configured exact-ID sources, ranks candidates by confidence, and returns proposed `artist_external_ids` records. It only persists proposed high-confidence exact IDs when `"dryRun": false`. `prioritizeMissing` defaults to `true`, so batches resolve artists missing requested IDs first instead of spending early batches on artists whose source coverage is already good. Set `prioritizeMissing=false` only when you need strict ticker-order pagination. Spotify candidate search requires `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`; YouTube candidate search requires `YOUTUBE_API_KEY`; MusicBrainz can run without a key but should be batched politely.

The `/dev` console can run a dry source resolver preview with an admin session, then save reviewed proposed source-ID records through the source-ID update endpoint. Persisted resolver auto-runs still require the `x-market-update-secret` header, so the browser never needs to receive the market secret.

## Market health

Use the admin health endpoint to check whether the engine has enough mapped artists and fresh data:

```txt
GET /api/admin/market-health
```

It reports active artist count, source-ID coverage, observation freshness by source/metric, fresh daily price-history coverage, quote tick coverage, recent market update runs, and warnings such as missing Spotify/YouTube credentials. Query params:

- `lookbackDays`: defaults to `30`
- `freshnessDays`: defaults to `2`
- `runDate`: defaults to today

This is the fastest way to see whether the market is ready for a real blended run or whether it is still missing IDs/baselines.

Use the admin integrity endpoint to audit recent trade demand before trusting trade-flow price signals:

```txt
GET /api/admin/market-integrity
```

It reports total recent trades, market-eligible trades, excluded admin/test trades, commission totals, concentrated order flow, and rapid repeated trading. The `/dev` console displays the same audit in the Market integrity panel. Admin emails are excluded from market impact by default so test orders can verify the product without polluting public price history or daily trade-flow demand.

## Go-live checklist

For local testing, the market engine is up when `/api/admin/market-health` shows:

- `readyForAdminWrites: true`
- fresh price history coverage
- fresh quote tick coverage
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
- optional `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `REDDIT_USER_AGENT`

After deployment, manually call `/api/cron/daily-market-update?dryRun=1` with `Authorization: Bearer <CRON_SECRET>` once. Then run one persisted `core` batch and recheck `/api/admin/market-health`. From that point forward, Vercel Cron can keep the graph history growing each day.

`MARKET_MODEL_VERSION` is an internal audit label, not a prominent user-facing product label. It is saved on market runs, signal snapshots, and price-history rows so future algorithm changes can be traced without rewriting historical prices. Normal market pages should keep broad language such as audience momentum, market activity, release signals, and media movement. Admin/health/debug views can show the exact model version.

`rmi-core-v13` adds artist-status event handling for death, legal arrest/charges/conviction/sentencing/incarceration/release, hospitalization, and injury. These events are stored inside normal `market_events` with `statusSubtype` metadata so no new public enum is required. Death events are not treated as a simple bearish controversy because posthumous streaming and catalog attention can rise; they produce a mixed status shock and, when high-confidence, can automatically halt the artist for admin review through the existing `artist_trading_halts` mechanism. Legal release is handled as a possible positive catalyst, while sentencing/incarceration carry stronger negative caps than arrest or charges.

`rmi-core-v12` adds reaction-consensus handling for reviews, public reaction clips, and social/community catalysts. Critic or streamer negativity is dampened when broader public/community/media reaction does not confirm it, boosted when multiple public source classes agree, and marked in raw diagnostics with reaction consensus labels. Media RSS also includes a free reviewer/video feed by default, and stored movement explanations are now written as high-level market notes instead of exposing model internals.

`rmi-core-v11` adds public social-web catalyst detection through Bluesky, expands the automatic event scanner with music/media RSS plus Google News RSS search, and prepares a public market-news API. The `core` path searches recent public Bluesky posts for each artist with no API key, stores aggregate observations only, and creates normalized market events for snippets, album announcements, release dates, tracklists, viral clips, performance reactions, feature/cosign chatter, backlash, controversy, and decline terms. Bluesky carries lower model weight than stronger sources, so it can catch early social movement without overpowering streaming, video, release, news, and trade data. The event scanner stores `media_rss` observations and classified `market_events` from no-key media feeds, giving the model another way to catch reviews, announcements, tracklists, controversies, and article-backed viral moments before they show up in audience counts. The public `/api/market/news` endpoint returns recent normalized `market_events` with artist/ticker metadata so a future HSX/Yahoo-style news module can be built without changing storage.

`rmi-core-v10` adds market integrity rules to the pricing loop. Trade-flow observations are still recorded, but they no longer become a `traderDemand` pricing signal unless order flow has at least three traders, at least $1,000 of eligible gross value, and no trader controlling more than 70% of the recent artist flow. New accounts can trade immediately, but their orders are marked market-ineligible for the first 24 hours by both the app route and `016_market_integrity_guardrails.sql`, so brand-new or duplicate accounts cannot immediately move public prices or feed the daily trade-flow model. The direct trade-impact function also checks database-side eligibility, so calling the Supabase RPC directly cannot bypass the cooldown.

`rmi-core-v9` makes event provenance part of pricing. Reddit catalysts now scale by engagement tier and subreddit tier, so small fan posts are dampened while major or breakout community attention gets more trust. Reddit collection queries both new and top weekly posts, then dedupes them, so a viral snippet or performance can still be detected if it happened earlier in the lookback window. GDELT/news events now scale by source tier, so weak article sources have less pricing power than stronger music or mainstream sources. Major features/cosigns, such as Drake, Carti, Future, Kendrick, or Travis-linked moments, are separated from ordinary feature chatter with a higher priority and wider positive shock cap. GDELT can also accept a high-signal article that matched the artist query even when the title leads with the bigger artist, but only for non-ambiguous artist names and stronger source/event matches. GDELT and official YouTube upload events now carry structured release kind metadata, so album, EP, mixtape, and deluxe/project catalysts are preferred over nearby individual track-upload reasons. Official YouTube upload sampling defaults to five recent uploads per artist, still without using expensive YouTube search, so release weeks with several track uploads are less likely to hide the real project catalyst. Relative repricing now adds a small opportunity-cost drift to the weakest quartile during broad positive markets when they do not have a positive high-priority catalyst, making all-green days less likely without suppressing real artist news. Release-database and official-upload events carry explicit provenance metadata in signal snapshots, and the default Reddit search pool now includes `trap` and `soundcloud` for better underground and SoundCloud-era coverage.

`rmi-core-v8` improves catalyst attribution and broad-market realism. Full project releases now outrank nearby single-track uploads, and structured MusicBrainz release kinds such as album, EP, mixtape, and single are trusted even when the title does not say "album" or "single". The event layer builds release-cycle context so project drops can absorb related track uploads, reviews, chart signals, snippets, and tracklist/cover-art reception instead of letting one small upload become the headline reason. Price runs now store `catalystDiagnostics`, `modifierImpact`, and `sourceAttribution` in signal snapshots so admin/debug views can identify the main catalyst, opposing catalyst, source disagreement, and net event shock behind a move. Reddit events now tag project-release chatter and engagement tier, helping separate small fan hype from major community attention. Relative repricing also adds a small crowded-market pressure adjustment, so weak/no-signal names are less likely to drift up merely because the full market had positive inputs. Run summaries now include catalyst counts, mixed-catalyst counts, source-conflict counts, and average source spread so `/dev` can warn when a market run is difficult to trust.

`rmi-core-v7` tightens price discovery for continuous markets. Audience snapshot sources such as Last.fm listeners/plays, Spotify followers/popularity, and YouTube channel totals compare against the latest prior observation instead of the 30-day average, then normalize by baseline age so multi-day accumulated growth is not mistaken for a one-day breakout. Snapshot adapters now lower confidence for stale baselines, impossible counter drops, extreme one-run jumps, and weak external artist-name matches before those values reach the blended model. Price-history context is also loaded from recent `price_history` rows, letting the model dampen overextended run-ups, respect weak downtrends, support confirmed reversals, and reduce noisy moves after high recent volatility. Old stored momentum decays toward neutral every run, and stale prior hype can create a small pullback when no fresh confirming signal appears. It also caps reliability for thin single-source moves, while allowing broader multi-source confirmation and event support to carry more weight. Source-level disagreement is now scored, so cases like streaming growth with negative reviews/news/community reaction are dampened instead of treated as clean bullish moves. Daily movement caps now scale down with low reliability, weak source quality, or source conflict. Same-day duplicate event detections are cluster-capped by event type so one release, snippet, or controversy cannot stack unlimited shocks from several sources; independent source confirmation can lift confidence inside that cap. Event shocks are subtype-aware, so features, viral performances, chart moments, snippets, reviews, controversies, and decline chatter use different price-shock limits. Feature, performance, snippet, and decline vocabulary is recognized across article events, Reddit posts, and official upload titles so early hype and falloff signals can be classified automatically. The event layer now separates longer-lived background event signal from short-lived direct price shock, preventing the same older release, review, or viral post from repricing the stock like a brand-new catalyst every day. Relative repricing is stronger so weak or missing momentum can drift lower when stronger artists are attracting the day's attention, and that relative pressure is dampened when a cron batch only covers part of the active roster. Run summaries now record up/down/flat counts, reliability bands, source-quality diagnostics, price-action guardrail usage, and market quality scores so `/dev` can warn when the market is one-sided, low-confidence, overextended, or low-quality.

`rmi-core-v6` adds optional Reddit community-hype detection. It measures post volume, engagement, subreddit breadth, positive hype, negative/decline chatter, and catalyst phrases for snippets, features, viral performances, releases, charts, and controversies. It records aggregate observations, limits first-run movement without a baseline, caps short/common-name confidence, and only creates market events when the post looks like a real catalyst with enough engagement or source breadth.

`rmi-core-v5` adds stock-like quote baselines and relative repricing: daily percentage change and daily movement caps use a fixed previous close, persisted runs prefer the latest saved close before the run date, timestamped `price_ticks` record trade and market-run quote movement for intraday charts, and weak/no-signal artists can drift lower when stronger names are attracting the day's momentum.

`rmi-core-v4` adds event ingestion from the scheduled GDELT scanner and official YouTube upload titles while keeping signal-reliability scaling. It can react to article-based news/reviews/releases and official-channel snippets, videos, singles, album trailers, and tour announcements before those moments fully show up in listener or view momentum. Review events apply signed price shocks instead of simple multipliers, so negative reviews can pull against a streaming/release spike and positive reviews can support it without accidentally softening an already-negative move.

`rmi-core-v3` added public-attention pageview momentum to the core model while keeping signal-reliability scaling. Broad, higher-confidence source coverage can move prices more than thin or single-source observations, which keeps the market responsive while reducing overreaction to weak data.

## Trading integrity controls

User trades should contribute to the market, but they should not overpower the real artist-momentum model. The current backend uses layered controls:

- The virtual market maker now quotes a synthetic bid/ask around the last price. Buys execute at the ask plus size-based slippage, sells execute at the bid minus size-based slippage, and the resulting public quote movement is capped separately.
- Spreads and slippage widen for lower-priced, higher-volatility, and larger orders, making thin artist stocks harder to manipulate cheaply.
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

That combines GDELT coverage, Last.fm audience momentum, public-attention pageview momentum, Spotify popularity/follower momentum, YouTube channel momentum, YouTube comment reaction, MusicBrainz release detection, and the market event/review layer. If optional source credentials are missing, the job returns a warning and skips that source instead of failing the whole dry run.

The production daily source is:

```json
{
  "dryRun": false,
  "source": "core",
  "artistLimit": 25,
  "artistOffset": 0
}
```

`core` combines Last.fm, public attention, YouTube channel stats, official YouTube upload events, public Bluesky social chatter, Reddit community-hype signals when Reddit credentials are configured, MusicBrainz release detection, stored market events, trade-flow demand, and Spotify when Spotify credentials are configured. YouTube comments are optional and disabled by default with `MARKET_YOUTUBE_COMMENT_VIDEOS=0`. `core` intentionally skips direct GDELT pricing because the free news endpoint can be slow or rate-limited. Instead, the scheduler can pre-scan a small artist batch for article-based events through GDELT plus media RSS feeds, then store those events for `core` to price through the normal event layer. Use `blended` when you intentionally want to include GDELT/news observations directly in a supervised run.

When enabled, the YouTube comments path samples recent comments from each artist's official channel. It stores aggregate observations only:

- `youtube_comments:comment_sentiment`
- `youtube_comments:comment_count`
- `youtube_comments:comment_like_count`
- `youtube_comments:positive_comment_share`
- `youtube_comments:negative_comment_share`

Raw comment text is not saved. The first run is treated as a baseline; later runs move the social/news/search parts of the model from changes in sentiment, likes, and net positive-vs-negative share. This prevents every naturally positive fan comment section from pushing a stock up every day.

The YouTube upload event path is separate from comment sentiment. It uses official channel upload playlists for artists with `youtube_channel_id`, classifies recent upload titles such as official videos, new singles, album trailers, deluxe/tracklist announcements, snippets, teasers, freestyles, performances, and tour announcements, and stores those matches as `market_events`. When several official-audio tracks appear together, the engine adds a project-release-cycle event and suppresses the individual track uploads as headline reasons. It does not use YouTube search, so it is much cheaper and less ambiguous than searching all of YouTube for an artist name. Defaults are `MARKET_YOUTUBE_UPLOAD_EVENT_VIDEOS=5` and `MARKET_YOUTUBE_UPLOAD_EVENT_DAYS=14`.

The Bluesky path is an early social-catalyst adapter. It searches recent public posts for each artist, stores aggregate observations only, and classifies snippet hype, album announcements, release dates, tracklists, viral clips, performance reaction, feature/cosign chatter, backlash, controversy, and decline terms. It can catch moments that may not have reached article coverage yet, but its source weight is intentionally below audience/video/release/news sources. Defaults are `MARKET_BLUESKY_POST_LIMIT=20`, `MARKET_BLUESKY_LOOKBACK_DAYS=7`, and `MARKET_BLUESKY_DELAY_MS=250`.

The media RSS path is an automatic news/review adapter used by the scheduled event scan. It fetches a built-in list of free music/media/reviewer feeds and optional Google News RSS searches for the selected artists, stores `media_rss:article_count`, `media_rss:source_count`, and `media_rss:classified_event_count` observations, then classifies release announcements, reviews, tracklists, public reaction clips, snippets, major features, viral performance coverage, controversies, and decline/falloff articles into `market_events`. Project-release articles can also infer a release date from article text, so an album announcement published before release week can still anchor the release event when the project drops. Defaults are `MARKET_RSS_GOOGLE_NEWS=true`, `MARKET_RSS_LOOKBACK_DAYS=30`, and `MARKET_RSS_MAX_ITEMS_PER_FEED=40`; `MARKET_RSS_FEEDS` can override the built-in comma-separated feed list, and `MARKET_REVIEWER_RSS_FEEDS` can append extra critic, streamer, or YouTube-channel RSS feeds without replacing the built-ins.

The Reddit path is a community-hype adapter, not a pure sentiment adapter. It searches configured music subreddits for each artist, stores aggregate observations only, and looks for broad attention plus catalyst language such as snippets, features, viral performances, release news, chart movement, controversies, or decline terms. It fetches both new and top weekly search results so high-engagement posts are not missed just because they are no longer the newest result. Defaults are `MARKET_REDDIT_POST_LIMIT=25`, `MARKET_REDDIT_LOOKBACK_DAYS=7`, and `MARKET_REDDIT_SUBREDDITS=hiphopheads,rap,trap,undergroundhiphop,playboicarti,soundcloud`. If Reddit credentials are missing, the rest of the `core` engine still runs.

The `core` and `blended` paths also detect recent MusicBrainz release groups for artists with `musicbrainz_id` set. The detector reads up to 100 release groups per artist so major artists with large catalogs do not hide recent releases behind older metadata. It stores confirmed releases as `market_events` with `eventType: "release"`, then lets the existing event/review layer apply decay, confidence, and price-shock caps. It only accepts full `YYYY-MM-DD` release dates and filters compilation/live/catalog-style records so vague metadata does not move the market.

The `gdelt` and `blended` paths can also create article-based market events. This detector is intentionally conservative: it requires the title to mention the artist or a quoted alias from the artist's GDELT query, only treats reviews as reviews when the title has review/rating language, recognizes release, chart, tour/festival, award, viral, public-conflict, and controversy terms, weighs trusted music/business/news domains higher, and limits detected events to the strongest few articles per artist per run.

Real-source market runs also include trade flow from saved buy/sell transactions. Individual market-eligible trades already apply a small immediate market-maker impact; the daily trade-flow adapter summarizes the previous day's net buy-vs-sell gross order value, trade count, and trader breadth into the `traderDemand` model input. Admin/test trades can be marked `market_eligible=false`, which lets the order execute in the tester's portfolio without moving public prices or counting as trade-flow demand. Trade-flow observations are included in the admin health endpoint so the operator can verify whether real trading demand is being measured.

## MVP product scope

The first public version should stay focused on always-on ArtistStocks. That keeps the learning curve low: users sign up, get a starter bankroll, buy/sell artists, build a watchlist, and compete on lifetime/weekly/monthly leaderboards. HSX-style AlbumStocks, SongStocks, FeatureStocks, EventStocks, IPO calendars, and settlement/cash-out rules are good long-term expansion paths, but they should wait until the artist market, source coverage, trade execution, and anti-manipulation rules are stable.

ArtistStock prices do not need a public one-line conversion like "H$1 equals $1M box office" yet. Internally, the price should represent expected near-term artist attention and demand. Later release/event securities should have clearer settlement math, such as first-30-day attention units for songs or first-4-week attention units for albums.

The update endpoint is batch-aware for a larger artist universe:

- `artistLimit` caps a single request at 100 artists.
- `artistOffset` starts the batch from a later point in the ticker-sorted artist list.
- Persisted real-source runs default to 100 artists per request when no limit is supplied.
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
- `artistLimit`: `MARKET_CRON_ARTIST_LIMIT`, default `100`
- `maxBatches`: `MARKET_CRON_MAX_BATCHES`, default `1`
- `eventScanLimit`: `MARKET_EVENT_SCAN_LIMIT`, default `20`
- `eventScanMaxRecords`: `MARKET_EVENT_SCAN_MAX_RECORDS`, default `12`
- `autoHaltDeathEvents`: `MARKET_AUTO_HALT_DEATH_EVENTS`, default `true`
- `mediaRssGoogleNews`: `MARKET_RSS_GOOGLE_NEWS`, default `true`
- `mediaRssLookbackDays`: `MARKET_RSS_LOOKBACK_DAYS`, default `30`
- `mediaRssMaxItemsPerFeed`: `MARKET_RSS_MAX_ITEMS_PER_FEED`, default `40`
- `mediaReviewerFeeds`: `MARKET_REVIEWER_RSS_FEEDS`, optional additive comma-separated RSS feed list
- `youtubeUploadEventVideos`: `MARKET_YOUTUBE_UPLOAD_EVENT_VIDEOS`, default `5`
- `redditPostLimit`: `MARKET_REDDIT_POST_LIMIT`, default `25`
- YouTube comments are quota-guarded separately. `MARKET_YOUTUBE_COMMENT_VIDEOS=0` keeps comment sentiment off; set it to `1` for limited comment sampling.

Before pricing, the cron route calls `POST /api/admin/market-event-scan` unless `MARKET_EVENT_SCAN_LIMIT=0`. That scanner uses the free GDELT news endpoint plus media RSS/Google News RSS search on the least-recently-scanned artists, stores `gdelt:article_count` and `media_rss:*` observations, and persists classified `market_events` for releases, reviews, tracklists, snippets, controversies, awards, tours, viral moments, and major news. The pricing job then reads those saved events through the `market_events` adapter, so news can affect the normal daily move without turning the whole production job into a slow full-GDELT run.

Event ingestion should be automatic in normal operation. The free automatic event sources are rotating GDELT news scans, media RSS/Google News RSS scans, official YouTube upload detection, public Bluesky social-catalyst detection, Reddit community-hype detection when credentials are configured, and MusicBrainz release detection.

The route skips duplicate same-day runs when a successful or running `core` run already exists. This matters because cron delivery is best-effort and can occasionally miss or duplicate invocations. For manual local testing, call the cron route with `x-market-update-secret: <MARKET_UPDATE_SECRET>`. Add `?dryRun=1` to exercise the full path without persisting another market run.

The market event layer stores releases, reviews, news, controversies, awards, tour announcements, and viral moments. These events can adjust the final price movement after raw momentum is calculated, so a stream spike with weak reviews can still rise, but by less than a stream spike with strong reviews.

Blended market runs use a confidence-weighted ensemble. Each adapter contributes most strongly to the stats it actually measures: Last.fm to streaming momentum, public-attention pageviews to search/media attention, YouTube channel stats to video momentum, YouTube comments and Reddit to fan/social reaction with different confidence caps, GDELT to news/search, Spotify to streaming/search proxies, trade flow to trading demand, and market events to release/news/social modifiers. This keeps the result from depending on adapter order and makes weak or indirect inputs less dominant.

Release explanations should prefer the real catalyst level. Full projects, mixtapes, albums, deluxe releases, and album announcements outrank individual official-audio uploads from the same release window. If the official channel posts a batch of official-audio tracks but no external source has named the project yet, the engine treats that batch as a project-release cycle instead of attributing the move to one random track. Track-level uploads still count as activity, but they receive smaller shocks and are suppressed as the headline reason when a project release is also present. The event model also builds a release-cycle context: related track uploads become supporting evidence, while tracklist, cover-art, and review reception can boost or dampen the project release impact depending on detected sentiment.

The admin event ingestion endpoint is:

```txt
POST /api/admin/market-events
```

Use the server-only header:

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

Those events are saved and then loaded by future market update runs. This endpoint is kept for server-side automation and emergency operator tooling, not for the normal market workflow. The normal event workflow should stay automatic through cron, GDELT/media RSS scans, Bluesky social detection, YouTube official-upload detection, and MusicBrainz release detection.

The protected event scanner endpoint is:

```txt
POST /api/admin/market-event-scan
```

The normal market workflow runs this automatically through cron. The `/dev` console keeps the scanner under `Advanced testing`; use `Preview` for a small dry scan, then `Save scan` to persist GDELT article-count observations and classified market events for a small least-recently-scanned artist batch while debugging.

It accepts a body such as:

```json
{
  "dryRun": false,
  "runDate": "2026-07-05",
  "artistLimit": 10,
  "maxRecords": 12
}
```

It does not update prices. It only saves article-count observations and classified market events, which are then used by the next `core` market update.

Example dry-run shape for testing the automatic core path:

```json
{
  "dryRun": true,
  "source": "core",
  "artistLimit": 5
}
```

For a persisted update, send:

```json
{
  "dryRun": false,
  "source": "core"
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
4. Applies category volatility and daily movement caps against the fixed previous close.
5. Saves artist prices, stats, signal snapshots, daily price history, intraday price ticks, and a market update run record.

## Market history

Real price history starts when the backend begins persisting `price_history` rows. Those rows are daily closes/opening snapshots, so an artist with only one saved date will otherwise render as a single point. `price_ticks` stores timestamped quote movement from trades and persisted market runs; short chart ranges use those ticks when available, while longer ranges keep using the lighter daily history.

Daily percentage change should be measured against one fixed previous close for the whole market day. Persisted market runs prefer the latest saved `price_history` close before the run date as that baseline, then write timestamped `price_ticks` as the current quote changes during the day.

The general market snapshot only carries a short recent history for each artist so the homepage stays fast with a large artist universe. Full chart ranges are loaded on demand from:

```txt
GET /api/market/history/:artistId?range=1M
```

Supported ranges are `1M`, `3M`, `6M`, `1Y`, and `ALL`. The artist detail page uses this endpoint for its graph range controls.

Historical backfill depends on the source:

- Last.fm `artist.getInfo` gives current listener/playcount totals, not reliable daily history. It is useful from the day we start tracking.
- Public attention pageviews can be queried for recent daily windows, but price movement should still use collected baseline comparisons rather than raw popularity.
- Spotify artist popularity and followers are mostly current snapshots unless we use a separate historical provider or have already been collecting them.
- YouTube channel statistics are current snapshots. They become useful for charts and price movement once the app has collected daily observations for each artist's official channel.
- GDELT can be queried historically by date window, so it is a realistic free candidate for backfilling news/article momentum.
- Billboard, airplay, chart, and SoundCloud historical data depend on access terms and available APIs/scrapers.

For launch, the honest product behavior should be "since listing" until enough real observations have accumulated. Intraday movement should come from real trades, persisted market runs, or clearly labeled synthetic liquidity/tick jobs. If we generate pre-launch history, it should be labeled as backfilled/model-estimated rather than pretending it was live market data.

## Market mechanics decision

Rap Market Index should follow an HSX-style virtual specialist model instead of a real brokerage schedule:

- Trading is continuous while the market is open. There is no stock-market-style 9:30 AM to 4:00 PM session for the first version.
- The daily source run creates the previous-close anchor and resets the daily change around midnight Pacific time.
- Eligible user trades can move the live quote intraday, but only inside capped quote/liquidity limits.
- Market notes are catalyst summaries, not proof of exact causation. Finance sites and HSX-style markets show news, events, and ticker context; they do not prove a single cause for every tick.
- Shorting should stay disabled until collateral, cover orders, exposure limits, and liquidation checks exist.

## Signal adapters

- GDELT news coverage adapter.
- GDELT article-to-event detector for reviews/news/controversies.
- Last.fm listener/playcount momentum adapter.
- Public-attention pageview momentum adapter.
- Spotify artist popularity/follower momentum adapter.
- YouTube channel view/subscriber/video-count momentum adapter.
- YouTube comment-reaction adapter.
- MusicBrainz release-event detector.
- Market event/review quality modifier.
- Chart/streaming momentum adapter.
- Search/social trend adapter.
- Manual review/release/news event adapter.
- Trader demand adapter from real buy/sell/short/cover transaction volume.

The important thing is that every adapter returns normalized momentum values, not raw popularity counts.

The YouTube channel-stat adapter intentionally uses `artist_external_ids.youtube_channel_id` instead of broad search during market runs. `channels.list` can fetch up to 50 channel IDs cheaply in one request, while search is expensive and can match unofficial fan or label channels. For a large artist universe, seed exact official channel IDs before relying on YouTube as a price input.

The YouTube comment adapter uses the channel's uploads playlist, samples a small number of recent official videos, and calls `commentThreads.list` for each sampled video. Keep `artistLimit`, `maxBatches`, and scheduler frequency conservative so a large market does not burn the free daily quota on comments. The current implementation defaults to two recent videos and 50 top-level comments per video.

The MusicBrainz release detector uses the public MusicBrainz web service and follows its one-request-per-second expectation. The current cron default is one 100-artist batch so the full market can be repriced against the same daily context while the active roster is still modest. When the roster grows beyond that, either increase runtime capacity or split batches knowingly, because relative pricing becomes less exact when the market is processed in separate slices.

## Trading flow

The real backend trading path is prepared through database functions:

- `public.buy_artist_shares(artist_id, shares, market_eligible)`
- `public.sell_artist_shares(artist_id, shares, market_eligible)`
- `public.short_artist_shares(artist_id, shares, market_eligible)`
- `public.cover_artist_shares(artist_id, shares, market_eligible)`

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

The database function handles the important atomic work: cash balance, holdings, average buy price, transaction record, commission, trading demand, and small market-maker price impact. Trades charge a 1% commission with a minimum of 2 cents per share. `market_eligible=false` is used for admin/test trades so the order still executes but does not move public prices or feed the trade-flow market signal.

Migration `017_market_operation_controls.sql` adds the market-operations layer:

- `public.market_controls` stores global trading mode, global trading pause, and market-impact pause.
- `public.artist_trading_halts` stores active per-artist halts.
- `public.get_market_trading_status(artist_id)` returns the current open/halted/impact status.
- The transaction eligibility trigger rejects trades while the market or artist is halted.
- `public.apply_artist_trade_impact` refuses price impact when impact is paused or the account is ineligible.

The app-facing status/control routes are:

```txt
GET /api/market/status
GET /api/market/status?artistId=ken-carson
GET /api/admin/market-controls
PATCH /api/admin/market-controls
```

Admin control writes require admin auth or the market update secret. This makes halts and market-impact pauses available before launch without exposing them to normal users.

Migration `018_short_selling_foundation.sql` adds the conservative short-selling backend:

- `public.short_positions` stores open short exposure and collateral.
- `public.short_transactions` stores short/cover order history.
- `public.market_trade_events` unifies long and short-side trades for integrity checks and trade-flow pricing.
- `public.short_position_risk` exposes current short liability and equity for account/admin views.
- Short proceeds are not spendable cash; users post collateral and realize P/L only when covering.
- A user cannot hold long and short exposure in the same artist at the same time.
- Short/cover trades use the same trading halts, market-impact pause, admin/test exclusion, commission, quote, slippage, daily limit, and anti-spam controls as long trades.

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
