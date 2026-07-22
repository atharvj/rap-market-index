import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const sourceExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);

function readTrackedFile(path: string) {
  return readFileSync(path, "utf8");
}

function getExportedRouteHandlers(path: string) {
  const contents = readTrackedFile(path);
  const sourceFile = ts.createSourceFile(
    path,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const httpMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) return [];
    if (!httpMethods.has(statement.name.text)) return [];

    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );

    return exported
      ? [{ method: statement.name.text, source: statement.getText(sourceFile) }]
      : [];
  });
}

describe("repository security boundaries", () => {
  it("does not track environment files or private key material", () => {
    const forbiddenFiles = trackedFiles.filter((path) =>
      /(^|\/)\.env(?:\.|$)|\.(?:key|pem|p12|pfx|dump|dump\.enc)$/i.test(path)
    );

    expect(forbiddenFiles).toEqual([]);
  });

  it("does not contain credential-shaped values in tracked source", () => {
    const patterns = [
      { label: "private key", value: new RegExp("-----BEGIN " + "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----") },
      { label: "OpenAI key", value: new RegExp("\\bsk-" + "[A-Za-z0-9_-]{20,}\\b") },
      { label: "Groq key", value: new RegExp("\\bgsk_" + "[A-Za-z0-9]{20,}\\b") },
      { label: "GitHub token", value: new RegExp("\\bgh[opusr]_" + "[A-Za-z0-9]{20,}\\b") },
      { label: "Google API key", value: new RegExp("\\bAIza" + "[A-Za-z0-9_-]{30,}\\b") },
      { label: "Stripe secret", value: new RegExp("\\bsk_(?:live|test)_" + "[A-Za-z0-9]{16,}\\b") },
      {
        label: "credentialed PostgreSQL URL",
        value: new RegExp("postgres(?:ql)?://" + "[^\\s:@/]+:[^\\s@/]+@", "i")
      }
    ];
    const findings: string[] = [];

    for (const path of trackedFiles) {
      if (
        !sourceExtensions.has(extname(path))
        || path === "package-lock.json"
        || path === "tests/repository-security.test.ts"
      ) {
        continue;
      }

      const contents = readTrackedFile(path);

      for (const pattern of patterns) {
        if (pattern.value.test(contents)) {
          findings.push(`${path}: ${pattern.label}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });

  it("keeps private environment variables out of client components", () => {
    const findings: string[] = [];
    const privateNames = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "MARKET_UPDATE_SECRET",
      "CRON_SECRET",
      "RATE_LIMIT_SECRET",
      "ACCOUNT_RECREATION_COOLDOWN_EXEMPT_EMAILS",
      "GROQ_API_KEY",
      "LASTFM_API_KEY",
      "YOUTUBE_API_KEY",
      "SPOTIFY_CLIENT_SECRET",
      "SENTRY_AUTH_TOKEN",
      "BACKUP_ENCRYPTION_KEY",
      "SUPABASE_DB_URL"
    ];

    for (const path of trackedFiles.filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file))) {
      const contents = readTrackedFile(path);
      const isClientModule = /^\s*["']use client["'];/m.test(contents);

      if (!isClientModule) continue;

      const leakedNames = privateNames.filter((name) => contents.includes(name));
      if (leakedNames.length) findings.push(`${path}: ${leakedNames.join(", ")}`);
    }

    expect(findings).toEqual([]);
  });

  it("requires server-side authorization in every admin route", () => {
    const adminRoutes = trackedFiles.filter((path) => /^app\/api\/admin\/.+\/route\.ts$/.test(path));
    const unprotected = adminRoutes.flatMap((path) =>
      getExportedRouteHandlers(path)
        .filter((handler) => !handler.source.includes("requireAdminRequest"))
        .map((handler) => `${path} ${handler.method}`)
    );

    expect(adminRoutes.length).toBeGreaterThan(0);
    expect(adminRoutes.flatMap(getExportedRouteHandlers).length).toBeGreaterThan(0);
    expect(unprotected).toEqual([]);
  });

  it("derives identity from a confirmed session in every private user-data route", () => {
    const privateRoutes = [
      "app/api/profile/avatar/route.ts",
      "app/api/profile/bootstrap/route.ts",
      "app/api/profile/delete/route.ts",
      "app/api/trades/route.ts",
      "app/api/watchlist/route.ts"
    ];
    const unprotected = privateRoutes.filter(
      (path) => !readTrackedFile(path).includes("requireConfirmedUser")
    );

    expect(unprotected).toEqual([]);
  });

  it("prevents account deletion from becoming an immediate fantasy-cash reset", () => {
    const deletionRoute = readTrackedFile("app/api/profile/delete/route.ts");
    const bootstrapRoute = readTrackedFile("app/api/profile/bootstrap/route.ts");
    const recreationProtection = readTrackedFile("src/server/account-recreation.ts");

    expect(deletionRoute).toContain("recordAccountDeletionCooldown");
    expect(deletionRoute).toContain("wasRecentlyAuthenticated");
    expect(bootstrapRoute).toContain("getActiveAccountRecreationCooldown");
    expect(recreationProtection).toContain('createHmac("sha256"');
    expect(recreationProtection).not.toContain("details: { email");
  });

  it("does not lock legacy passwords out of account deletion", () => {
    const deletionRoute = readTrackedFile("app/api/profile/delete/route.ts");
    const settingsPage = readTrackedFile("app/settings/page.tsx");

    expect(deletionRoute).not.toContain("body.password.length < 8");
    expect(settingsPage).not.toContain("deletePassword.length < 8");
    expect(settingsPage).toContain("setDeleteError(payload.error");
  });

  it("binds watchlist and portfolio reads to the authenticated user", () => {
    const watchlist = readTrackedFile("app/api/watchlist/route.ts");
    const bootstrap = readTrackedFile("app/api/profile/bootstrap/route.ts");

    expect(watchlist).toContain('.eq("user_id", context.userId)');
    expect(watchlist).toContain("user_id: context.userId");
    expect(bootstrap).toContain("const profileSupabase = createServiceRoleClient()");
    expect(bootstrap).toContain("loadHoldings(profileSupabase, user.id)");
    expect(bootstrap).toContain('.eq("user_id", userId)');
    expect(bootstrap).not.toMatch(/request(?:Body|Data|Payload)?\.userId/);
  });

  it("does not expose private profile fields or holdings by default", () => {
    const publicProfile = readTrackedFile("app/api/public/users/[id]/route.ts");
    const publicSelect = publicProfile.match(/\.select\("([^"]*profile_is_public[^"]*)"\)/)?.[1] ?? "";

    expect(publicSelect).not.toContain("email");
    expect(publicProfile).toContain("profileRow.portfolio_is_public ? await loadPublicHoldings");
  });

  it("keeps trade ownership inside the authenticated database session", () => {
    const tradeRoute = readTrackedFile("app/api/trades/route.ts");
    const longRpc = readTrackedFile("supabase/migrations/015_market_maker_quotes.sql");
    const shortRpc = readTrackedFile("supabase/migrations/018_short_selling_foundation.sql");

    expect(tradeRoute).not.toMatch(/request(?:Body|Data|Payload)?\.userId/);
    expect(tradeRoute).toContain("const serviceSupabase = createServiceRoleClient()");
    expect(tradeRoute).toContain('serviceSupabase.rpc("execute_artist_trade_as_user"');
    expect(tradeRoute).toContain("p_user_id: authUser.id");
    expect(longRpc.match(/v_user_id uuid := auth\.uid\(\);/g)?.length).toBeGreaterThanOrEqual(2);
    expect(shortRpc.match(/v_user_id uuid := auth\.uid\(\);/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not expose the service-role key through the browser Supabase client", () => {
    const client = readTrackedFile("src/lib/supabase/client.ts");

    expect(client).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(client).not.toContain("createServiceRoleClient");
  });

  it("keeps user feedback behind the server route and service role", () => {
    const route = readTrackedFile("app/api/feedback/route.ts");
    const migration = readTrackedFile("supabase/migrations/028_user_feedback.sql");

    expect(route).toContain('scope: "feedback-submit-ip"');
    expect(route).toContain('"feedback-submit-user" : "feedback-submit-anonymous"');
    expect(route).toContain("getRequestIp(request)");
    expect(route).toContain("requireConfirmedUser(request)");
    expect(route).toContain('createServiceRoleClient().from("user_feedback").insert');
    expect(route).not.toMatch(/request(?:Body|Data|Payload)?\.userId/);
    expect(migration).toContain("alter table public.user_feedback enable row level security");
    expect(migration).toContain(
      "revoke all on table public.user_feedback from public, anon, authenticated"
    );
    expect(migration).toContain("grant all on table public.user_feedback to service_role");
    expect(migration).not.toMatch(/create policy/i);
  });

  it("reasserts raw database privilege boundaries in the latest migration", () => {
    const migration = readTrackedFile("supabase/migrations/026_reassert_security_boundaries.sql");

    expect(migration).toContain("begin;");
    expect(migration.trimEnd()).toMatch(/commit;$/);
    expect(migration).toContain("revoke all on table public.market_observations from public, anon, authenticated");
    expect(migration).toContain("revoke all on table public.market_leaderboard from public, anon, authenticated");
    expect(migration).toContain("to_regclass('public.season_leaderboard')");
    expect(migration).toContain("to_regprocedure('public.get_active_season_id()')");
    for (const table of [
      "profiles",
      "holdings",
      "transactions",
      "watchlist",
      "short_positions",
      "short_transactions"
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(
        `revoke all on table public.${table} from public, anon, authenticated`
      );
      expect(migration).toContain(`grant all on table public.${table} to service_role`);
    }
    expect(migration).toContain("grant execute on function public.hook_reject_disposable_email(jsonb)");
    expect(migration).toContain("drop function if exists public.buy_artist_shares(text, numeric, uuid)");
    expect(migration).toContain("revoke all on function public.buy_artist_shares(text, numeric, boolean)");
    expect(migration).toContain(
      "create or replace function public.execute_artist_trade_as_user"
    );
    expect(migration).toContain(
      "grant execute on function public.execute_artist_trade_as_user"
    );
    expect(migration).not.toContain(
      "grant execute on function public.buy_artist_shares(text, numeric, boolean)\n  to authenticated"
    );
    expect(migration).toContain("alter default privileges for role postgres in schema public");
    expect(migration).toContain(
      "revoke select, insert, update, delete on tables from anon, authenticated, service_role"
    );
    expect(migration).toContain(
      "revoke usage, select on sequences from anon, authenticated, service_role"
    );
    expect(migration).toContain(
      "revoke execute on functions from public, anon, authenticated, service_role"
    );
  });

  it("prevents usernames that differ only by letter case", () => {
    const profileRoute = readTrackedFile("app/api/profile/bootstrap/route.ts");
    const migration = readTrackedFile("supabase/migrations/029_case_insensitive_usernames.sql");
    const signupGuard = readTrackedFile("supabase/migrations/030_signup_username_guard.sql");

    expect(profileRoute).toContain("hasUsernameConflict");
    expect(profileRoute).toContain('.ilike("username", escapedUsername)');
    expect(migration).toContain("group by lower(username)");
    expect(migration).toContain("having count(*) > 1");
    expect(migration).toContain("unique index if not exists profiles_username_case_insensitive_unique");
    expect(migration).toContain("on public.profiles (lower(username))");
    expect(signupGuard).toContain("That username is already taken.");
    expect(signupGuard).toContain("user_metadata");
    expect(signupGuard).toContain("lower(profile.username) = lower(requested_username)");
  });

  it("keeps trading closed until the Eastern release window is repriced", () => {
    const migration = readTrackedFile("supabase/migrations/031_release_window_guard.sql");
    const tradeRoute = readTrackedFile("app/api/trades/route.ts");

    expect(migration).toContain("America/New_York");
    expect(migration).toContain("run.status = 'succeeded'");
    expect(migration).toContain("e.event_type = 'release'");
    expect(migration).toContain("v_latest_quote_at");
    expect(tradeRoute).toContain("loadReleaseWindowStatus(serviceSupabase)");
    expect(tradeRoute).toContain("isPendingCatalyst");
  });
});
