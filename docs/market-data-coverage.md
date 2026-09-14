# Market data coverage

Model: `rmi-core-v36`. These are fantasy-market estimates, not observable exchange prices. More inputs should improve coverage and explain movement; they do not establish a uniquely correct dollar price.

## Sources and cadence

| Input | What it measures | Collection and limits |
| --- | --- | --- |
| Spotify public artist data | Monthly listener changes and audience scale | Daily; unavailable pages never become zero listeners. Public artist pages do not provide comprehensive song-level stream histories. |
| Last.fm | Listening pace among Last.fm users | Daily and intraday. Compare measured rates with the artist's own history; this is a sample, not all streaming activity. Canonical aliases include Ye → Kanye West. |
| Wikipedia | Artist-page attention | Complete daily pageview totals, with recent daily and weekly comparisons. Attention is not automatically positive reception. |
| YouTube channels | Channel audience/viewing pace | Daily and intraday; provider counters are batched. |
| YouTube recordings and performances | Acceleration or slowing of views on individual songs and trusted performance videos | New in v36: up to four recent recordings per artist, with shared observations for verified collaborators. Includes official audio and music videos. Fetches video statistics in batches of 50. First observations seed baselines; missing videos, reset counters and unverified uploader identities do not create negative signals. |
| Official uploads | Confirmed releases and explicit performing credits | v36 adds hourly discovery during intraday refreshes, instead of waiting for the next daily run. Latest 12 uploads per artist, up to 14 days old. Actual uploader metadata is retained separately from the artist channel. |
| Trusted editorial videos | Performances, music interviews and documentaries | Nine configured publisher channels. v36 checks up to 20 uploads per channel across 30 days and allows hourly discovery. Only qualifying performances feed the new performance-view metric. |
| Apple Music charts | Changes in chart rank/presence, not stream counts | New in v36: complete top-100 song charts for the US, UK and Canada, collected daily. Requires valid provider IDs/URLs, freshness and a previous comparable chart. Absence on both dates gives no listening signal. Partial/failed charts cannot create chart exits. |
| Verified music journalism | Releases, reviews, tours, chart milestones and other material developments | Publisher feeds and artist searches, with both display and canonical names. Fast scheduled catalyst scans plus deeper periodic scans. Publication dates, artist attribution and source quality are checked. |
| Video comments | A bounded sample of reaction | Existing daily source. Comments, channel totals and song views count as one YouTube provider when estimating independent-source confidence. |
| RMI trades | Activity inside the game | Existing bounded trade-flow input; separate from external music demand. |

Hourly discovery is a minimum interval between scans, not a guaranteed arrival time. It runs when the scheduled refresh executes; provider publication delays and scheduler delays still apply. Broader coverage requires working provider responses, not simply more configured source names.

### Scheduler finding, September 14

The existing GitHub catalyst workflow requested 15-minute intervals, but its latest actual runs were at 01:02, 06:15 and 13:08 UTC on September 14. All succeeded; the missing invocations happened before the application ran. The free schedule now uses minutes 7, 22, 37 and 52 to avoid the hourly rush and the deeper scan at minute 15. This mitigates contention, but does not guarantee the interval: [GitHub documents that scheduled jobs can be delayed or dropped](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).

The live team is on Vercel Hobby, which permits only daily cron invocations. A proposed native schedule after an authorized Pro upgrade would preserve the existing release-window entry and add this entry to `vercel.json`:

```json
{ "path": "/api/cron/catalyst-refresh", "schedule": "7,22,37,52 * * * *" }
```

The endpoint already supports the configured `CRON_SECRET`. Disable the GitHub catalyst schedule when enabling the native schedule to avoid duplicate jobs. This proposed entry is not enabled on Hobby. [Vercel's cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [Pro pricing](https://vercel.com/docs/plans/pro-plan) list a $20/month platform fee, including one deploying seat and $20 usage credit, with additional usage billed separately. No upgrade or purchase has been made.

## Relevance and recording credits

An article published today about an old release is not a new release. History columns, anniversaries and retrospectives are excluded from catalysts and pricing. A newly announced anniversary tour, reissue or actual chart return can still qualify. Any measurable renewed listening is evaluated through audience sources.

Official recording credits come from an explicit performer prefix, a `feat./ft./featuring` clause, or a labeled performer-credit line. The same resolver drives public tags, artist-page inclusion, event attribution and recording-view observations. A song named after an artist, producer credit, shout-out or incidental mention is insufficient. Ordinary news subject tags remain distinct from recording credits.

News and official-video coverage may be deduplicated for catalyst scoring while the underlying recording remains available for measuring views. One platform's multiple metrics are not counted as independent corroborating platforms.

## September 3 Ye coverage

The saved audit showed the September 3/4 pricing runs had very little usable artist evidence. Homecoming coverage was published/ingested September 4; the older model also rejected relevant performer headlines. One reunion headline was classified as generic conflict because it mentioned “beef.” v36 recognizes explicit onstage reunions and searches both Ye and Kanye West. A deeper preview recovered the September 4 Billboard reunion report.

These repairs do not manufacture a September 3 price jump or overwrite previously recorded closes. New data affects current/future estimates subject to recency, corroboration and quality. A well-received show need not outweigh all other measured inputs, and no artist is guaranteed constant movement.

## Further coverage worth pursuing

The next substantial gap is comprehensive song-level streams, playlist additions/removals, social reach and concert ticket demand. Those require licensed providers or authorized artist/platform access. No paid subscription or private artist access has been enabled by this repair. Provider coverage, historical depth, entity matching and commercial-use terms should be checked before choosing one.

MusicBrainz recording/release artist credits can supplement explicit upload credits when matching recordings unambiguously; the existing release collector remains disabled by default. A title-only match is insufficient. Unverified social posts and unavailable sources do not become price evidence.

Primary provider references: [YouTube video metadata/statistics](https://developers.google.com/youtube/v3/docs/videos), [batched video retrieval](https://developers.google.com/youtube/v3/docs/videos/list), [Apple chart feeds](https://rss.marketingtools.apple.com/), [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [MusicBrainz artist credits](https://musicbrainz.org/doc/Artist_Credits).
