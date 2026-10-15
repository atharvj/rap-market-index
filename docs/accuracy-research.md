# Accuracy research and implementation, October 14, 2026

RMI estimates a fantasy music market. There is no independently observable dollar
price against which every artist's quote can be proved correct. We can measure
identity accuracy, event detection, source coverage, sentiment classification,
data latency and prediction of subsequent music demand. More sources help only
when they add reliable evidence about the right artist at the right time.

## Implemented in rmi-core-v40

- Apple Music album charts join song charts: complete top-100 feeds for the US,
  UK and Canada. Six feeds remain one provider, not six independent witnesses.
  Song points retain their original meaning; album points have a separate series.
  A new album observation establishes a baseline instead of creating a rally.
- 83 of the 89 artist profiles now have Apple artist IDs verified through canonical
  MusicBrainz links and Apple's artist lookup. A solo name match with a conflicting
  verified ID is rejected. The remaining six gaps are explicit in tracking health.
  Compound performer credits still require actual credited names. A guest named
  in an album title does not establish a performer credit on every album track.
- A chart must contain 100 unique valid entries and a fresh provider timestamp.
  Failed countries do not create exits; a partial regional sum is not published
  as a smaller total. A separate keyed snapshot retains usable comparisons.
- Bluesky searches both latest and top results for each of at most three verified
  artist/alias/release queries. Both sorts must succeed for a query to be admitted.
  Other complete queries can survive a partial failure, at reduced confidence and
  with a new comparison cohort. URI duplicates, long copied posts, and prolific
  authors cannot inflate the apparent number of independent opinions.
- In multi-artist Bluesky posts, explicit clauses separate each artist's reaction.
  An unresolved comparison, joint clause or pronoun is unknown rather than an
  opinion copied to everyone. Arbitrary quoted search phrases are not aliases;
  compact names must match complete tokens.
- Shared reception scoring reads explicit 0–10 ratings, including decimals, while
  preserving negation. Explicit `/s` sarcasm abstains. This does not solve general
  irony, slang, multilingual interpretation or all comparisons.
- YouTube recording likes and comment totals are retained alongside already-fetched
  views, with no extra statistics requests. Hidden/missing counters stay missing.
  These are observation history, not an extra positive price coefficient. Comment
  volume does not establish approval, and likes lack a public dislike denominator.
- Both reception collectors use sampling version 4. Prior sampling-method caches
  and Bluesky catalysts are not replayed. No historical price reset or artist-specific
  target return is part of this update.

The production API keeps a bounded sample. Top posts can be highly selective;
latest posts can be spammed; combining the two is not a representative fan poll.
YouTube's existing time/relevance combination has the same limitation. A short
independent reaction is not deduplicated merely because another fan said “fire.”

Official references: [Apple chart feeds](https://rss.marketingtools.apple.com/),
[Bluesky search lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/searchPosts.json),
[YouTube comment retrieval](https://developers.google.com/youtube/v3/docs/commentThreads/list),
[YouTube video counters](https://developers.google.com/youtube/v3/docs/videos),
[MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API).

## Sources to pursue, in order

This is an implementation priority assessment, not a claim that the services below
are connected or that a subscription includes every listed field. No purchases,
access applications, account changes or messages to providers were made.

| Priority | Evidence | Best route found | Admission requirement and interpretation |
| --- | --- | --- | --- |
| 1 | Historical listening, song/album trajectories, playlist additions/removals and audience geography | Trial [Soundcharts](https://developers.soundcharts.com/) and [Chartmetric API](https://chartmetric.com/features/api-access) against the actual roster | Verify the contracted fields, platform coverage, history, update lag and rights. Potential playlist audience is not measured plays. Compare daily rates with an artist's own prior pace; retain platform definitions. |
| 1 | Sales and on-demand consumption beyond public charts | Evaluate [Luminate](https://docs.luminatedata.com/docs/getting-started) and its [consumption data](https://docs.luminatedata.com/docs/consumption-data-provider) | Confirm territory, reporting period, artist/recording joins, revisions and access. Weekly industry totals cannot be called daily streaming observations. |
| 1 | Wider independent fan reactions | Authorized [X search](https://docs.x.com/x-api/posts/search/introduction), plus existing Bluesky and verified YouTube audiences | Requires developer credentials and applicable paid/approved access. Recent and archive access differ. Keep platform cohorts separate; replies, quote posts, reposts and duplicate text are not independent votes. |
| 2 | Tour announcements, on-sale dates, postponements and cancellations | [Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery/v2/) | Requires a registered API key and canonical attraction matching. Covers listings/status, not actual attendance or tickets sold. A venue's capacity does not prove a sell-out. Guest appearances need performer evidence. |
| 2 | Actual touring performance | Verified promoter/artist reports and licensed box-office data | Retain event date, venue, paid attendance and reported gross separately. Ask whether the provider supplies actual box-office reports; a “live events” product may only supply listings. Repeated reports of one show form one event. |
| 2 | Search attention | [Google Trends API alpha](https://developers.google.com/search/apis/trends) | Application/approval required. Use stable artist/topic identity, country and comparable series. Search interest is attention, not approval. No unofficial scraping endpoint is treated as approved API access. |
| 2 | TikTok song use and attention | Licensed music-data coverage, or an explicitly eligible approved platform route | [Research Tools](https://developers.tiktok.com/docs/en/about-research-api) have eligibility requirements; they are not general commercial access for RMI. Their [FAQ](https://developers.tiktok.com/docs/en/research-api-faq) also describes freshness limits. Creator/video counts measure spread, not universal approval or exact listening. |
| 2 | Direct Instagram/artist analytics | Authorized artist accounts or a provider contract covering the needed fields | Do not assume access to arbitrary artists' private insights or audience demographics. Public engagement and authorized first-party insights are different evidence. |
| 2 | Independent criticism and numerical review scores | Existing publisher feeds plus verified canonical review metadata | Keep critic reaction separate from fan opinion. Only read a review's explicitly defined rating/scale and reviewed work; a generic page/product aggregate rating is insufficient. No headline-tone shortcut to a numerical review score. |
| 2 | Faster performance and release discovery | Official artist/label/venue channels, trusted editorial feeds, and a dependable scheduler | RMI already has 13 configured publisher feeds, artist searches, official uploads and editorial video sources. Improve missing-event detection and scheduling before adding repeated versions of the same story. A scheduled invocation is not proof it ran. |
| 3 | Radio airplay, Shazam and market-specific discovery | Licensed provider endpoints after field-level validation | Useful corroboration for demand/geography, not direct fan sentiment. Station adds, spins, recognition counts and streams must remain distinct. |
| 3 | Canonical identities and actual collaborators | [MusicBrainz search/API](https://musicbrainz.org/doc/MusicBrainz_API/Search), provider IDs and [artist credits](https://musicbrainz.org/doc/Artist_Credits) | Match artist IDs, recording/release IDs and ISRC when available. ISRCs can be duplicated or attached to alternate editions; title-only matching is insufficient. Producer, songwriter and guest appearance credits are not automatically performing-artist credits. |
| 3 | Independent listening communities | Existing Last.fm and optional [ListenBrainz statistics](https://listenbrainz.readthedocs.io/en/latest/users/api/statistics.html) | Confirm usable roster coverage first. Scrobblers are a selected sample. An absent artist or unavailable endpoint is not zero listeners. Never add a thin source just to increase the apparent source count. |
| Restricted | Reddit | Current request was rejected | Remains disabled. No scraping, alternate credentials or proxy is substituted for permission. |
| Restricted | Fan rating sites and review aggregators | A documented license or permitted API/feed | An accessible web page is not a bulk-data license. Review bombing, tiny samples, duplicate accounts and critic-versus-user scores require separate handling. Not connected by this update. |

### Spotify constraints

The standard artist Web API is not comprehensive monthly-listener or per-song
stream-history access. Development-mode restrictions remove several artist fields
and endpoints; do not assume every app still receives followers/popularity.
The March change restored album/track `external_ids`, not the removed artist fields.
Multiple application IDs are not independent quota buckets under the July account
quota rules. Public missing values must remain missing.

References: [February changes](https://developer.spotify.com/documentation/web-api/references/changes/february-2026),
[March changes](https://developer.spotify.com/documentation/web-api/references/changes/march-2026),
[July changes](https://developer.spotify.com/documentation/web-api/references/changes/july-2026).

### Direct feed checks

The official US Apple album feed returned 100 entries during research. The older
iTunes genre-RSS route returned only 10 albums and 25 songs despite a requested
limit of 100. Such a response cannot establish a complete top-100 chart or a chart
exit, so that alternative was not enabled.

YouTube documents an August 24, 2026 change in view-count definitions across video
formats. Backtests spanning that boundary must treat the definition change as a
possible measurement break. Counter semantics and provider revisions need effective
versions, just as sampling methods do. This update does not rewrite old counters
or prices to manufacture comparability. Public dislike counts remain owner-only.
[Official statistics definitions](https://developers.google.com/youtube/v3/docs/videos).

## Accuracy work after acquisition

1. **Build an independently reviewed evaluation set.** Sample real permitted
   observations across all 89 artists, recent and established releases, successes
   and failures. Label actual subject(s), release/performance, event date,
   factuality, reaction target, positive/negative/mixed/unknown, irony and evidence
   strength. Use two reviewers and adjudicate disagreements. Include UY SCUTI,
   Slime Language 3, Ye's September performance and the Cardi/DC misattribution
   as regression cases, without using only cases chosen to force desired moves.
2. **Measure the right errors.** Report wrong-artist rate, false fresh-release rate,
   duplicate-event rate, stance precision/recall, abstention rate, missing-event
   detection delay, per-artist usable-source coverage and freshness. Break out
   emerging artists, common names, each platform and each language. Passing unit
   tests proves selected behavior, not real-world classification accuracy.
3. **Use a second classifier only after evaluation.** Test an aspect-aware language
   model against the current heuristic on held-out artist/release/date groups.
   Require quoted supporting spans, explicit subjects and uncertainty. Provider
   text is untrusted data; it cannot issue tool instructions or approve aliases.
   Unsupported confident guesses must lose to abstention. A second model reading
   the same posts is not a second independent source.
4. **Separate dimensions.** Keep commercial demand, fan reception, critic reception,
   attention, touring and in-game trade demand identifiable. Young Thug can have
   negative fan reaction and strong listening/touring simultaneously. A strong
   show can be a positive component even when the overall quote falls. A lack of
   usable data means low confidence, not average fan sentiment or a forced decline.
5. **Calibrate prospectively.** Compare fixed, versioned candidates on later
   streaming/chart/touring outcomes using time-separated holdouts; avoid leakage
   from later articles or revised chart totals. Check calibration and source
   ablations by artist size. Start a new input in observation-only mode before
   admitting it to pricing. Do not optimize for jagged charts or a preferred price.
6. **Preserve provenance and clocks.** Retain source URL/provider ID, fetched time,
   published time, actual event/release time, territory, sampling version, metric
   definition and confidence. Deduplicate syndicated stories and cross-posts.
   Missing responses, rate limits, hidden counters and incomplete cohorts must
   never become zero popularity. Revisions affect documented current inputs;
   recorded price history remains intact.

## Practical next acquisition step

Run a field-by-field coverage trial with Soundcharts/Chartmetric, and obtain a
separate Luminate quote if consumption coverage is needed. Ask for daily historical
values for all 89 canonical artist IDs and their releases; require actual sample
responses, update latency, historical start dates, revision rules, API allowance,
retention/redistribution rights and permission to derive/display game estimates.
Test emerging artists and the known missed events, not just superstars. Select
based on measured incremental coverage and allowed use, not advertised platform
count. This is the largest remaining acquisition step; it has not been purchased.
