# Security and Scaling Runbook

This runbook covers controls that cannot be guaranteed by application code
alone. Complete it before inviting public users and review it after material
authentication, database, or deployment changes.

## Required Deployment Steps

1. Keep the numbered files in `supabase/migrations/` as immutable database
   history. Production already reflects the files through `035`; the site owner
   should not run them manually. Before applying a future migration, a developer
   must inspect the local and remote Supabase migration ledgers. Migration 024
   adds distributed API rate limiting, migration 025 adds the disposable-email
   signup hook, and migrations 028-030 add private feedback storage,
   case-insensitive username uniqueness, and pre-email username rejection.
2. Generate a server-only rate-limit secret locally:

   ```bash
   openssl rand -hex 32
   ```

3. In Vercel, open **Project > Settings > Environment Variables**, add the value
   as `RATE_LIMIT_SECRET`, select Production, Preview, and Development, then
   redeploy. Never prefix this variable with `NEXT_PUBLIC_`.
4. Keep `SUPABASE_SERVICE_ROLE_KEY`, `MARKET_UPDATE_SECRET`, `CRON_SECRET`,
   `GROQ_API_KEY`, API client secrets, and `RATE_LIMIT_SECRET` server-only.
5. Configure `NEXT_PUBLIC_SITE_URL` as `https://rap-market-index.vercel.app` in
   production. It is used when validating browser mutation origins.
6. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to Vercel using the public site key from
   the Cloudflare Turnstile widget. This key is intentionally browser-visible;
   never put the Turnstile secret key in Vercel or source control.
7. Set `ACCOUNT_RECREATION_COOLDOWN_EXEMPT_EMAILS` only when operator-owned test
   accounts need to bypass the 7-day deletion cooldown. Store a comma-separated
   email list as a sensitive Production/Preview variable and never prefix it
   with `NEXT_PUBLIC_`.

If migration 024 has not been run, the application uses an instance-local rate
limiter. That fallback is useful during development but is not sufficient for a
multi-instance production deployment.

## Supabase Checklist

- Keep Row Level Security enabled on every exposed table. Run **Database >
  Security Advisor** after every migration and resolve all unexpected findings.
- Keep email confirmation required. Disable anonymous sign-ins unless the
  product intentionally adds anonymous accounts.
- Configure CAPTCHA in this order: deploy the application with
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, verify the widget appears on the account
  page, and only then enable Cloudflare Turnstile under Supabase Auth bot and
  abuse protection using the Turnstile secret key. Reversing this order can
  block password authentication.
- Review **Authentication > Rate Limits** and keep conservative limits for OTP,
  password recovery, sign-up, and token refresh endpoints.
- Set the Site URL to `https://rap-market-index.vercel.app`. Add only required
  redirect URLs, including `https://rap-market-index.vercel.app/account/confirmed`.
  Keep localhost redirects for local development and avoid broad production wildcards.
- If Google sign-in is enabled, add
  `https://rap-market-index.vercel.app/onboarding` to the Supabase redirect URL
  allowlist. The Google OAuth client must use Supabase's provider callback URL,
  not a Vercel page, as its authorized redirect URI.
- Require MFA on the Supabase project owner account and every GitHub/Vercel
  account with production access.
- Use a password manager and unique passwords. Enable leaked-password
  protection if it is available on the current Supabase plan.
- Review **Database > Performance Advisor** as traffic grows. Add indexes only
  for measured slow queries because excess indexes increase write cost.
- Configure custom SMTP before a large launch so confirmation and recovery email
  delivery is not dependent on development limits.
- Verify account deletion once with an email/password-only account, once with a
  Google-only account, and once with a linked email/password plus Google account.
  Confirm that each linked method stops working and the deleted email receives a
  7-day profile-creation cooldown, except for explicitly configured operator test accounts.
- Export data regularly. A free project can be paused for inactivity and does
  not provide the same backup guarantees as a paid production database.
- Confirm the **Encrypted application backup** GitHub workflow succeeds daily
  and download a verified artifact before major data operations.

## Vercel and GitHub Checklist

- Keep Preview Deployment Protection enabled and do not place production secrets
  in untrusted branch previews.
- Keep the Vercel Firewall enabled. Add a WAF rate-limit rule for repeated abuse
  of `/api/*` if traffic justifies its usage cost; application limits remain the
  primary free control.
- Set usage alerts for functions, bandwidth, and database egress. No free service
  can guarantee unlimited traffic or zero downtime.
- Protect `main`, require passing checks before merging, and keep Dependabot
  security updates enabled.
- Add `MARKET_UPDATE_SECRET` to **GitHub repository > Settings > Secrets and
  variables > Actions** if the scheduled market-news workflow is enabled. Never
  store its value in workflow YAML.
- Enable private vulnerability reporting in the repository Security settings.

## Key Rotation

Rotate a secret immediately if it appears in a screenshot, chat, log, commit,
browser bundle, or untrusted machine.

1. Generate a replacement at the provider.
2. Update Vercel and GitHub Actions without deleting the old value first.
3. Redeploy and verify the affected job or integration.
4. Revoke the old value.
5. Review Vercel, Supabase, GitHub, and provider logs for unexpected use.

Rotate the Supabase service-role key with extra care because it bypasses RLS.

## Monitoring and Incident Response

- Check Vercel function errors, latency, and request volume.
- Check Supabase Auth logs, Postgres logs, Security Advisor, Performance Advisor,
  database size, connection count, and egress.
- Investigate sudden account creation, repeated 401/403/429 responses, unusual
  portfolio resets, or market-job invocations outside the expected schedule.
- Admin mutations should remain attributable through the admin action log.
- If compromise is suspected, pause trading, rotate affected keys, invalidate
  sessions, preserve logs, fix the root cause, and only then restore service.

## Capacity Notes

- Public market responses use CDN caching where freshness allows it.
- User, trade, and admin mutations remain uncached and are distributed-rate
  limited after migration 024.
- Database indexes support the current trade and event read paths. Re-run query
  analysis against real production traffic before adding speculative indexes.
- Free Vercel and Supabase quotas are hard capacity boundaries. The application
  is designed to fail closed for sensitive operations and return bounded errors,
  but it cannot promise that a free tier will serve an arbitrary number of users.

## Release Gate

Before a public announcement:

- `npm audit` reports no known vulnerabilities.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
- All numbered migrations through 031 are installed, and the signup-validation
  Before User Created hook from migration 025 is enabled in Supabase Auth.
- CAPTCHA, email confirmation, redirect allowlists, MFA, and deployment
  protection are verified manually.
- A new non-admin account can sign up, confirm email, trade, update a watchlist,
  recover its password, and delete its account without seeing another user's
  private data. Google-only deletion and the 7-day recreation cooldown are also
  verified in production.
- An unauthenticated visitor cannot call admin routes, mutate profiles, trade, or
  read private holdings.
- Backup/export and key-rotation procedures have been tested once.
