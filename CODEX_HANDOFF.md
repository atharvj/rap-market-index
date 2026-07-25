# Rap Market Index Handoff

Updated: July 24, 2026

## Project

Rap Market Index is a free fantasy rapper stock market. Users receive virtual
cash, trade artist shares, build portfolios and watchlists, and compete on
portfolio value. It is not a real-money exchange and does not offer deposits,
withdrawals, prizes, or artist ownership.

- Production: https://rap-market-index.vercel.app/
- GitHub: `atharvj/rap-market-index`
- Branch: `main`
- Local repo: `/Users/atharvjoshi/Downloads/coding/rap-market-index`
- Stack: Next.js 15, React 19, Supabase, Tailwind CSS, Vercel

## Working agreement

- Treat this file as conversation history, but verify important claims against
  the repository and live systems.
- Update this file after material project changes.
- The user authorizes Codex to commit and push project changes when asked and
  whenever a meaningful, verified checkpoint should be preserved. Do not make
  the user commit or push manually.
- Use short, natural commit messages. Do not rewrite existing Git history just
  to change old message style.
- Never push a broken build or discard unrelated user work.
- Fix systems, not one named artist or one headline.

## Current product state

Implemented:

- Email/password and Google authentication with confirmed-email enforcement.
- Linked auth identities for the same verified email.
- Unique, space-friendly usernames with inline conflict errors.
- Seven-day account-recreation cooldown with configured test-account
  exemptions.
- Profiles, avatars, bios, favorite artists, privacy settings, watchlists,
  portfolios, rankings, and admin roles.
- Virtual buy/sell flow with server-side integrity checks, spread/commission,
  rate limits, and admin trades excluded from demand signals.
- Daily market runs, midnight Eastern release-window checks, quote ticks,
  persisted history, run metadata, integrity guardrails, and an admin `/dev`
  console.
- Last.fm, YouTube, Wikimedia, MusicBrainz, news/RSS, source-backed research,
  public reaction, and eligible trade-flow adapters.
- Public news grouping with multi-artist attribution.
- Feedback submission stored in the Supabase `user_feedback` table. It is not
  emailed.
- Sentry error reporting and automated encrypted application backups.
- Public mobile/desktop pages and Playwright coverage.

Production market state last checked on July 24, 2026:

- 79 active artists
- latest daily run succeeded on model `rmi-core-v27`
- full active-artist price/history coverage
- balanced gainers and decliners
- ListenBrainz is optional and currently unconfigured

## Latest changes

This checkpoint adds:

- automatic saving when favorite artists are added or removed on the profile;
- manual saving retained for the bio;
- profile-picture removal, including storage cleanup;
- clearer account-page copy;
- optional ListenBrainz status on `/dev` without false coverage warnings;
- one shared story-equivalence rule for the feed and price engine;
- deduplication by canonical URL, syndicated headline, named release, and
  same-event coverage;
- separation of reviews and later release lifecycle events;
- rejection of lifestyle stories, speculative credits, and secondhand conflict
  commentary as price catalysts;
- public conflict chatter made neutral unless a separate concrete music or
  audience signal supports movement;
- patched production dependencies after an npm security audit;
- a concise backend architecture note replacing the repetitive roadmap.

The live-data validation used existing stored stories and reduced the 60-day
news result from 64 rows before the work to 41 relevant grouped stories. It
removed exact duplicates, repeated upload coverage, the DJ Akademiks
Jay-Z/Drake allegation, lifestyle stories, and speculative feature stories.
The original song and a genuinely later music video remain separate.

## Market rules

- Prices must use persisted source observations or eligible trades. Do not
  invent intraday movement or historical backfill.
- RMI Score is current signal strength, not an expected-return promise.
- News is only one input. A story must be relevant, attributable, and
  sufficiently supported before it can affect a quote.
- Duplicate coverage of one underlying event counts once.
- Reviews, later videos, and other genuinely new lifecycle developments may
  count separately.
- Secondhand gossip, generic celebrity/lifestyle coverage, weak reposts, and
  unsupported rumors should not move prices.
- Historical points stay tied to their original run/model unless the user
  explicitly approves a market reset.
- Inactive artists are not part of the current public roster or normal update
  workload.

## Operations

Primary references:

- `docs/backend-roadmap.md` — short architecture map
- `docs/supabase-setup.md` — initial backend setup
- `docs/operations-runbook.md` — release window, Sentry, backups, incidents
- `docs/security-and-scaling.md` — launch and capacity checks

Migrations currently run through `035`. Keep applied migrations because they
are production schema history. New migrations are only for durable database
changes, not ordinary artist edits or app behavior.

Important environment variables include:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MARKET_UPDATE_SECRET
CRON_SECRET
ADMIN_EMAILS
LASTFM_API_KEY
YOUTUBE_API_KEY
GROQ_API_KEY
LISTENBRAINZ_USER_TOKEN
RATE_LIMIT_SECRET
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
ACCOUNT_RECREATION_COOLDOWN_EXEMPT_EMAILS
SENTRY_AUTH_TOKEN
NEXT_PUBLIC_SENTRY_DSN
```

Never put secret values, private emails, or service keys in Git or this file.

## Release-source decision

“Dropping tonight” social accounts usually compile official artist/label
announcements, DSP pre-save pages, media calendars, and community tips. Do not
scrape Instagram or X: access is brittle, API use is restricted, and it is not a
dependable free production source.

Prefer the existing official YouTube mappings and release-window scan, plus
MusicBrainz and selected editorial calendars/RSS. Spotify for Artists has
upcoming-release data, but it is private to each artist team and cannot serve as
a public roster-wide source.

## Validation

Run before a meaningful push:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
npm audit --omit=dev
git diff --check
```

At this checkpoint:

- unit tests: 136 passed
- targeted news tests: 31 passed
- TypeScript: passed
- production build: passed on Next.js 15.5.21
- Playwright: 14 passed
- production dependency audit: 0 vulnerabilities after updating Next.js to
  15.5.21 and `brace-expansion` to 5.0.8

After pushing, watch the GitHub workflow and deployment, then recheck `/dev` and
the public news API. Stop local dev servers after testing.

## Near-term priorities

- Invite a small tester group and watch account, trade, feedback, and market
  behavior.
- Review Sentry and backup workflow results rather than adding more features.
- Monitor deduplication and event relevance as fresh stories arrive.
- Add paid email/domain or data infrastructure only when usage justifies it.
- Keep leagues and public short selling out of launch until there is enough
  activity and risk testing.
