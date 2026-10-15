# Market data coverage

Model: `rmi-core-v43`. These are fantasy-market estimates, not observable exchange prices. More inputs should improve coverage and explain movement; they do not establish a uniquely correct dollar price.

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

Artist attribution uses each artist's verified names and aliases. Quoted search
terms are never aliases, separate name words cannot establish identity, and compact
names require a complete token match. Common names such as Future, ian and Protect
require artist context. Quoted music titles do not establish performer credits.

The same attribution checks protect incoming events, stored-event pricing, news
badges and artist feeds. Related-ID lists and other articles grouped with a story
cannot supply unsupported badges. Verified publisher descriptions can establish
genuine participants; descriptions are shared only for the same article URL and
headline. Different articles about different concert participants remain separate.
Official recordings retain the explicit performer-credit resolver.

The October 14 audit covered all 1,199 saved events, including 764 article rows.
Publisher metadata was rechecked for ambiguous cases. Unsupported associations are
quarantined through an attribution-rejection flag, preserving the original event
record and recorded price history. Verified participants, including Tezzus as a
Young Thug tour support act, remain eligible. Legacy coverage without sufficient
identity evidence stays excluded rather than being guessed.

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

## Refresh and source health

The admin health report pages through observations, closes, ticks and events instead of silently stopping at the database's 1,000-row response limit. Requests exceeding the pager's 100,000-row safety bound fail explicitly. Coverage includes Spotify monthly listeners, Apple charts, recording-level YouTube views and editorial discovery, with the latest observation timestamp.

Every successful quote persistence now records a `market_refresh:completed` observation for each updated artist, including unchanged quotes. The last-hour coverage warning measures actual refresh completion independently of daily closes and price movement. Failed stats, history, artist or tick writes do not record completion. A failed completion write fails the refresh; this does not make the preceding separate database writes transactional. Existing scheduler delays remain possible and are now visible in this metric.

Snapshot failures are not cached. An initial feed outage displays unavailable artist
data rather than claiming the artist does not exist. Repeated failures cannot claim
to show a previously verified quote unless a snapshot actually loaded successfully;
later failed or malformed snapshots retain those verified quotes with a warning.

Malformed Apple chart identities and non-numeric YouTube counters cannot seed observations. A chart older than the saved provider timestamp is ignored. These checks do not change the v36 formula or reset price history. Trading status must contain one valid control record; public status and all order types fail closed when it is missing or malformed.

Automation responses require an explicit boolean success flag. The release-window,
catalyst, daily-update, batch-run and manual-run paths return an HTTP failure when
an upstream operation fails, including failures incorrectly wrapped in HTTP 200.
Scheduled workflows independently check the JSON success flag and print concise
completion counts instead of the full source payload. This makes execution failures
visible in Actions; it does not fix delayed or missing scheduler invocations.

The catalyst workflow first checks the idempotent daily release-window endpoint.
If midnight scheduling was missed, it completes and verifies the daily opening
and ends that invocation; otherwise it continues the normal intraday scan. This
uses the existing free workflow and does not add scheduled jobs. A delayed catalyst
invocation can still delay recovery; no constant scheduling cadence is guaranteed.

## September 27 chart display window

Artist price and observation charts default to 3M (93 days); explicit shorter ranges
remain available. The shared public snapshot now supplies the same window to home,
market-board and sidebar sparklines. Market Pulse, Scout and current-holdings trend
builders retain up to 94 inclusive daily points instead of cutting them to 28.
Only existing recorded sessions are displayed: a new listing need not have a full
three months. No price model, stored quote or historical adjustment was changed.

An unavailable artist-history request no longer substitutes another range's daily
snapshot into the selected chart. Loading and failure states are explicit, aborted
requests cannot overwrite a newer selection, and unrelated snapshot refreshes no
longer restart the history request. Unchanged quotes are described as unchanged,
not missing closes. The reusable Market Inputs component also exposes every returned
metric instead of limiting its selector to six (it is not currently mounted on the
public artist page, which uses the Audience Snapshot).

## October 13 opening and display integrity audit

The release window verifies today's closes against the active artist IDs; inactive
listings cannot substitute for a missing active close. Active rosters are paginated.
A successful daily core run is still required before opening.

Market Pulse and Scout chain the average daily return of artists with recorded
quotes on both dates. New listings join after they have comparable observations;
no quote is assigned before their listing date. The current-holdings trend starts
when all held assets have recorded quotes. These are display calculations and do
not change artist prices, trades, balances, or stored history.

Artist charts and public indicators cancel superseded requests and time out hung
requests after 20 seconds. A failed background refresh retains the last loaded
values with an explicit warning; an initial failure reports unavailability.
All available public indicators are displayed, including the seventh Orders metric.

The same audit found newly published dependency advisories. Runtime dependencies
were patched to Next.js 15.5.27 and sharp 0.35.5, with updated minimum overrides for
brace-expansion 5.0.12, fast-uri 4.1.5 and source-map-js 1.2.2. The old styling build
chain included braces 3.0.3, for which no patched release is published. Tailwind was
migrated to 4.3.3 with its supported PostCSS plugin, existing theme configuration,
explicit app/src sources, and documented utility renames preserving visual values.
The full npm audit, including development dependencies, reports zero findings.

References: [sharp's security advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w),
[unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[Tailwind's upgrade guide](https://tailwindcss.com/docs/upgrade-guide).
Tailwind 4 requires Safari 16.4+, Chrome 111+ or Firefox 128+; older browsers are
outside the styling framework's supported targets. Visual and mobile checks must
pass against the existing snapshots before deployment.

Market Pulse and Scout chart axes, tooltips and selected values use index points,
rather than dollar signs. Artist quote and current-holdings charts retain currency
formatting. Indices start at 100 for the displayed window.


## October 14 reception sampling repair (v37)

Reddit access was rejected. Collection, saved intraday inputs and Reddit event
pricing are disabled unless both `MARKET_REDDIT_API_APPROVED` and
`MARKET_REDDIT_ENABLED` are explicitly true. Credentials alone are insufficient.
No alternative Reddit scraper was introduced.

YouTube reaction sampling uses up to three verified recordings or trusted
performances/lyrics interviews per artist, including explicitly credited
collaborators' uploads. Uploader identity is checked again against video metadata.
One available slot is reserved for an independent editorial audience. Recent and
relevant comment lists are combined, duplicate comments and repeated authors are
limited, and comments older than seven days or dated in the future are excluded.
Four bounded workers share video requests across collaborators. Production sampling
settings are three videos and fifty comment results per video across both orders.

At least twelve recent comments and six identifiable reactions are required for
pricing. Unclassified text is unknown, not approval or evidence of neutral consensus.
Negation, basic music reaction terms and unambiguous approval/disapproval emoji are
handled, but this remains a heuristic with limited language and sarcasm coverage.
Confidence remains capped; an artist-owned channel is not a representative fan poll.
Only comparable video cohorts under the same sampling method yield reception momentum.
Insufficient samples expose counts without manufacturing sentiment measurements.

More comments, likes or replies do not automatically raise prices. YouTube comments
contribute only to audience response, not searches or viewing demand. Negative reception
stays a negative contribution even when engagement rises or criticism softens. Streams,
chart activity, viewing acceleration and verified touring events remain separate inputs
and can outweigh negative reception. No coefficient was selected to force Young Thug down.

Bluesky caps posts per author, lowers confidence for small low-engagement samples,
and signs attention with reception instead of rewarding all chatter. Critical release
and performance reactions cannot become positive hype events. Tiny uncorroborated posts
cannot become catalysts merely because a classifier assigns a strong impact. Malformed
provider responses are failures rather than zero discussion. Cached reactions and
social catalysts from the prior sampling method are excluded from current pricing.

Artist indicators show positive/negative shares and recent comment sample counts when
available, with the sample limitation stated. Initial UY SCUTI reviews from 2025 are
outside recorded RMI history and are not reintroduced as fresh 2026 catalysts. Slime
Language 3's August 2026 release is recorded; old criticism is not proof of current
reception. Reviews describe critics' opinions, not a fan sentiment poll. Sparse reaction
coverage remains a gap, especially when videos have few recent comments. This repair
does not overwrite earlier closes or manufacture historical album reactions.

References: [YouTube comment sorting](https://developers.google.com/youtube/v3/docs/commentThreads/list),
[Reddit approved access](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data),
[UY SCUTI review](https://pitchfork.com/reviews/albums/young-thug-uy-scuti/),
[Slime Language 3 review](https://pitchfork.com/reviews/albums/young-stoner-life-young-thug-slime-language-3/).


## October 14 artist tracking profiles (v38)

The finite active roster now has 89 explicit identity profiles in
`src/data/artistTrackingProfiles.json`. All MusicBrainz identities and configured
YouTube channels were checked. Fifteen artists have curated alias variants, and
74 English Wikipedia titles were resolved through linked Wikidata entities.
Profiles supplement missing Wikipedia mappings only when the saved MusicBrainz ID
matches; operator mappings and conflicting IDs are preserved. Unknown/new listings
continue with the generic collector until a profile is verified.

The profiles carry 175 supported album contexts. Candidate album groups were checked
for an Official release and performing artist credit; bootleg-only and undated
entries were rejected. The compilation Slime Language 3 is explicitly a label-project
context for Young Thug, supported by its catalogue record and a primary review's
attribution. This does not credit him as a performer on every compilation track.
Metadata is matching context and never creates a release event or a price bonus.
Four catalogues were incomplete because of the provider's 100-group limit or an
unavailable browse response. This is recorded in the profile and health report.

Social collection performs at most three distinct artist/alias/album-context searches
per artist, deduplicates returned posts, and discounts partial search coverage. Most
album searches require the artist's name. Only explicitly approved distinctive
contexts allow album-only matching: UY SCUTI and Slime Language 3. Such matching also
requires music context; astronomy discussion and generic album titles do not establish
artist identity. Posts about known old albums cannot become fresh social catalysts.

Artist names appearing in a post and factual release announcements do not establish
fan approval. Social pricing now uses identifiable positive/negative reactions rather
than a classifier's announcement/status boost. Unclassified posts do not establish
neutral sentiment. Reaction counts and engagement seed comparisons under the same
query cohort and sampling version. Old v37 reception inputs and social events are not replayed by
v38. Both reception collectors use sampling version 3. Sources remain bounded samples, with limited language/sarcasm understanding.
Current streaming, viewing and verified news/touring inputs remain separate.

Recording credit resolution also recognizes vetted stage aliases in explicit performer
credits, with the same strict prefix/feature rules. Incidental mentions and song titles
still do not create collaborators. Video candidates now cover 90 recorded days rather
than 30, while only fresh comments contribute to reception. Older recording counters
still require their own comparable baselines before yielding viewing acceleration.

The admin health report lists each artist's search names, supported album contexts,
linked Wikipedia identity and remaining gaps. Metadata older than 30 days is flagged
for review. This registry is curated reference data, not an automatically complete or
permanently fresh catalogue. New artist/release discovery continues separately; it does
not automatically approve extra stage aliases. Public artist indicators expose sampled
social reaction counts and sentiment scores when sufficient reactions are available.
No source profile contains prices or artist-specific target returns, and stored prior
closes are not rewritten by these tracking changes.

References: [MusicBrainz alias types](https://musicbrainz.org/doc/Aliases),
[MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API),
[Slime Language 3 attribution](https://pitchfork.com/reviews/albums/young-stoner-life-young-thug-slime-language-3/).


`bluesky:reaction_sentiment` is a new observation metric. Earlier
`average_sentiment` values are retained as legacy classifier measurements; they
are not relabeled as newly measured fan opinions. Missing/insufficient reaction
samples do not create zero sentiment readings. Complete time/relevance comment
requests are required before a video is admitted to the reaction cohort.


## October 14 broader evidence research (v40)

The [accuracy research and acquisition plan](accuracy-research.md) records primary
provider references, implemented improvements, access limits and an evaluation
plan. Album charts now accompany song charts across the same three Apple
storefronts. Their first observations seed baselines; partial country totals are
not published as apparent declines. Both chart types share one provider. Verified
Apple artist IDs now cover 83 profiles; the six remaining gaps appear in tracking
health.

Bluesky expands from latest-only to latest and top results. Both sorts must
complete for each admitted query. Long copied posts do not become independent
fans, explicit multi-artist clauses keep their own reactions, and unresolved
comparisons abstain. Both reception collectors now use sampling version 4 and
recognize explicit numerical ratings. Older method caches are excluded. Additional
YouTube recording likes/comment counters are retained from existing requests for
observation history; no extra positive pricing coefficient was added for them.

The strongest remaining acquisition candidates are licensed historical streaming/
playlist coverage and verified touring outcomes. X search requires appropriate
API access; Google Trends alpha requires approval; TikTok research eligibility is
not general commercial access. Reddit remains disabled after the rejected request.
No paid service or new account access was enabled. The current lexical reception
model remains limited and needs independently reviewed, held-out evaluation before
any claim of representative fan sentiment or quantified classification accuracy.


## October 15 market date: free coverage improvements (v41)

YouTube requests up to 100 candidates in each existing time/relevance comment call,
then interleaves recent results and applies the configured sample cap after ID,
author and copied-text checks. This increases the pool within the same two comment
requests. Comments still require a verified uploader, at least twelve recent
comments and six identifiable reactions. The legacy upload-playlist path now also
rechecks actual video uploaders. Future timestamps are excluded, including future
times on today's date.

Both reception collectors share artist-specific clause selection. Explicit criticism
of one collaborator cannot become another's negative reaction; unresolved joint
clauses and pronouns abstain. YouTube now also deduplicates long copied reviews.
Sampling version 5 and the configured sample limit identify comparable cohorts;
older saved methods are excluded from pricing.

Every completed/failed reception attempt records availability. Public indicators
withhold an older headline reception estimate when a newer sample is insufficient
or unavailable. Recorded historical points remain available. Sampled and classified
comment counts are separate, and the public page explains unavailable estimates.

All 89 profiles now have verified Apple artist IDs. The remaining six mappings were
checked against official Apple artist/catalogue records and already verified release
contexts; same-name thin/incorrect artist pages were excluded. Paginated MusicBrainz
browse results resolve the four incomplete provider scans, yielding 176 verified
release contexts. Ye's contexts now include BULLY. A complete provider browse is not
a claim that the community database contains an artist's entire real catalogue.

An older album's title no longer suppresses an explicitly current concert reaction
with actual artist identification and recent performance language. Replays/throwbacks
and album-only matches remain excluded from fresh catalysts. Trusted editorial video
matching now recognizes verified stage aliases and ignores quoted music titles as
performer identities. No artist is guaranteed a price increase from a performance.

The existing catalyst workflow now calls an authenticated chart-recovery endpoint
after its normal update. Complete current-date snapshots skip collection; incomplete
scans can retry at most once per hour per artist. Failed attempts also record the
throttle marker. Recovery saves observations independently of prices and never calls
quote persistence. It needs no paid provider or additional scheduled job. GitHub
scheduling is still best-effort and provider failures can still leave partial data.

Reference: [YouTube's comment endpoint limits and sorting](https://developers.google.com/youtube/v3/docs/commentThreads/list).


### Older-recording fallback (v42)

A paired live check found no recent saved video candidates for Drake or Ye. When
that happens, the daily collector now inspects up to fifty uploads from the
verified official channel and selects at most three public music recordings.
Actual uploader, public status, duration, music category/explicit recording markers,
and performing credits are checked. Trailers, interviews, shorts and another
performer's explicitly credited recording are excluded. Only comments from the
last seven days count; no old upload becomes a new release event.

Older-recording cohorts have a separate sample scope, half the usual confidence
ceiling, a recorded catalogue-video count and a public explanation that comments
may concern those songs rather than the newest album. This is broader current
listener feedback, not representative reception of a particular new album. The
fallback adds bounded public API requests only for artists without eligible recent
candidates; the two balanced comment requests per sampled video are unchanged.


### Recovery of rejected and thin samples (v43)

An unusable saved recording no longer blocks official-channel discovery. The
collector checks up to six recent candidates, replacing rejected uploaders,
disabled comments and empty recent responses. Thin samples can add verified
recordings until fifty independent comments are available, with at most six
nonempty recordings and twelve attempted videos per artist. Limits scale down
when fewer primary videos are configured. The expansion rule uses quantity, never
sentiment or whether the text is classified. Uploader and performer checks remain
mandatory; an older recording still has reduced confidence and explicit context.
YouTube sampling version 6 invalidates older cached reception comparisons.

A successful production market snapshot schedules a freshness check after returning
the response, using [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).
If any current artist lacks a completed refresh within thirty minutes, an atomic
database cooldown admits at most one visitor recovery attempt per fifteen minutes.
It calls the existing authenticated daily opening or intraday catalyst refresh;
the intraday path also retries incomplete Apple observations. The destination is
fixed server-side, the credential is never exposed, and redirects are rejected.
No visitor can choose an artist, source, date or target price. Mock, preview and
failed snapshots do not trigger collection. Scheduled and visitor-triggered price
automation share a fifteen-minute database window to avoid overlapping runs. Lock
failures stop work rather than falling back to an instance-local lock. The existing
workflow exits on a busy response and reports failures without an immediate retry
that could be mistaken for completion. This adds recovery during site use, not a
promise that collectors run while nobody visits or a provider is unavailable.

Previous-close loading now re-queries unresolved artists when the backend's first
page is dominated by another artist's history. Baseline pages retry an explicit
Postgres statement cancellation once; a repeated error still blocks repricing and
identifies the affected source. Neither repair discards history or substitutes a
made-up baseline. No paid provider, AI research service or scheduler was enabled.

The full-roster channel audit also verified separate Vevo recording channels for
Drake, Eminem, Future, Kendrick Lamar, Lil Wayne, Travis Scott and Ye. Each added
channel has a canonical artist-to-YouTube MusicBrainz relation and matching official
Vevo API metadata. Recording selection alternates verified channels within the
same bounded attempt budget. Uploader verification still applies. An overridden
canonical identity cannot inherit old companions. These channels do not add their
subscriber or lifetime-view counters to the primary channel totals. The confidence
reduction for older recordings follows their share of retained comments, so several
almost-empty recent videos cannot disguise a sample dominated by older songs.

Within each verified channel, catalogue discovery alternates recent uploads and
recordings with more lifetime comments, using statistics in the same metadata
request. Lifetime volume only prioritizes discovery; it adds no price signal, and
only actual last-seven-day comments are admitted. This keeps several quiet recent
uploads from hiding ongoing discussion of an artist's established recordings.
