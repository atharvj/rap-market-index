import { expect, test, type Page } from "@playwright/test";
import { createInitialGameState } from "../src/lib/market";
import type { GameState } from "../src/lib/types";

const dailyMoves = [4.8, 3.4, 2.1, 1.3, 0.7, 0.2, -0.3, -0.8, 1.8, -1.4, 0.9, -0.5, 2.7, -1.1, 1.2, -0.2];

const marketState: GameState = (() => {
  const initial = createInitialGameState();
  const artists = initial.artists.slice(0, 16).map((artist, index) => {
    const dailyChangePercent = dailyMoves[index];
    const currentPrice = Number((artist.currentPrice * (1 + index * 0.004)).toFixed(2));
    const previousClose = Number((currentPrice / (1 + dailyChangePercent / 100)).toFixed(2));
    const priceHistory = Array.from({ length: 8 }, (_, pointIndex) => {
      const date = new Date("2026-07-10T12:00:00Z");
      date.setUTCDate(date.getUTCDate() + pointIndex);
      const drift = (pointIndex - 7) * (dailyChangePercent / 100 / 7);
      const wave = Math.sin((pointIndex + index) * 1.15) * 0.008;

      return {
        date: date.toISOString().slice(0, 10),
        price: Number((currentPrice * (1 + drift + wave)).toFixed(2))
      };
    });
    priceHistory[priceHistory.length - 1].price = currentPrice;

    return {
      ...artist,
      currentPrice,
      previousClose,
      dailyChangePercent,
      hypeScore: Math.min(94, 61 + index * 2),
      priceHistory,
      lastMoveExplanation: `${artist.ticker} moved as verified audience and release signals changed.`
    };
  });

  return {
    ...initial,
    artists,
    lastUpdatedAt: "2026-07-17"
  };
})();

const marketNews = [
  {
    id: "news-1",
    artistId: marketState.artists[1].id,
    artistName: marketState.artists[1].name,
    ticker: marketState.artists[1].ticker,
    relatedArtists: [],
    eventDate: "2026-07-17",
    eventType: "release",
    eventLabel: "Album release",
    title: `${marketState.artists[1].name} releases a new project as first-day attention builds`,
    sourceName: "RMI Test Wire",
    sourceDomain: "example.com",
    sourceUrl: "https://example.com/story-one",
    sentimentScore: 0.74,
    impactScore: 84,
    confidence: 0.94
  },
  {
    id: "news-2",
    artistId: marketState.artists[2].id,
    artistName: marketState.artists[2].name,
    ticker: marketState.artists[2].ticker,
    relatedArtists: [
      {
        artistId: marketState.artists[7].id,
        artistName: marketState.artists[7].name,
        ticker: marketState.artists[7].ticker
      }
    ],
    eventDate: "2026-07-16",
    eventType: "news",
    eventLabel: "Festival performance",
    title: `${marketState.artists[2].name} and ${marketState.artists[7].name} lead a major festival announcement`,
    sourceName: "RMI Test Wire",
    sourceDomain: "example.com",
    sourceUrl: "https://example.com/story-two",
    sentimentScore: 0.42,
    impactScore: 73,
    confidence: 0.88
  },
  {
    id: "news-3",
    artistId: marketState.artists[3].id,
    artistName: marketState.artists[3].name,
    ticker: marketState.artists[3].ticker,
    relatedArtists: [],
    eventDate: "2026-07-15",
    eventType: "review",
    eventLabel: "Review consensus",
    title: `Early reviews shift the outlook for ${marketState.artists[3].name}'s latest release`,
    sourceName: "RMI Test Wire",
    sourceDomain: "example.com",
    sourceUrl: "https://example.com/story-three",
    sentimentScore: -0.28,
    impactScore: 65,
    confidence: 0.9
  },
  {
    id: "news-4",
    artistId: marketState.artists[4].id,
    artistName: marketState.artists[4].name,
    ticker: marketState.artists[4].ticker,
    relatedArtists: [],
    eventDate: "2026-07-14",
    eventType: "tour",
    eventLabel: "Tour announcement",
    title: `${marketState.artists[4].name} adds new dates after strong demand`,
    sourceName: "RMI Test Wire",
    sourceDomain: "example.com",
    sourceUrl: "https://example.com/story-four",
    sentimentScore: 0.38,
    impactScore: 58,
    confidence: 0.86
  },
  {
    id: "news-5",
    artistId: marketState.artists[5].id,
    artistName: marketState.artists[5].name,
    ticker: marketState.artists[5].ticker,
    relatedArtists: [],
    eventDate: "2026-07-13",
    eventType: "award",
    eventLabel: "Award nomination",
    title: `${marketState.artists[5].name} receives a major award nomination`,
    sourceName: "RMI Test Wire",
    sourceDomain: "example.com",
    sourceUrl: "https://example.com/story-five",
    sentimentScore: 0.51,
    impactScore: 61,
    confidence: 0.91
  }
];

async function installPublicFixtures(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("rmi-theme", "dark");
  });

  await page.route("**/api/market/snapshot", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, source: "supabase", state: marketState })
    })
  );
  await page.route("**/api/market/news**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, news: marketNews })
    })
  );
  await page.route("**/api/leaderboard", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        leaderboard: [
          {
            id: "fixture-user",
            username: "MarketTester",
            portfolioValue: 104_250,
            cashBalance: 18_000,
            gainPercent: 4.25,
            rank: 1,
            portfolioIsPublic: true
          }
        ]
      })
    })
  );
}

async function assertStablePublicPage(page: Page, path: string, heading: string, snapshot: string) {
  const response = await page.goto(path);
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Runtime ChunkLoadError");
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important}nextjs-portal{display:none!important}"
  });
  await expect(page).toHaveScreenshot(snapshot, { fullPage: false });
}

test.beforeEach(async ({ page }) => {
  await installPublicFixtures(page);
});

test("homepage visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/", "Spot the next rise.", "homepage.png");
  await expect(page.getByText("Strongest signal", { exact: true })).toBeVisible();
});

test("homepage does not call the second-ranked RMI score the strongest signal", async ({ page }) => {
  await page.unroute("**/api/market/snapshot");
  const topGainerIsSignalLeader: GameState = {
    ...marketState,
    artists: marketState.artists.map((artist, index) => ({
      ...artist,
      hypeScore: index === 0 ? 99 : index === 1 ? 90 : Math.min(89, artist.hypeScore)
    }))
  };
  await page.route("**/api/market/snapshot", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, source: "supabase", state: topGainerIsSignalLeader })
    })
  );

  await page.goto("/");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText("Next strongest signal", { exact: true })).toBeVisible();
  await expect(page.getByText("Strongest signal", { exact: true })).toHaveCount(0);
});

test("homepage artist search opens as an overlay without resizing the hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

  const hero = page.getByTestId("home-market-hero");
  const search = page.getByPlaceholder("Search an artist, e.g. Ken Carson");
  const before = await hero.boundingBox();

  await search.focus();
  const results = page.getByTestId("home-search-results");
  await expect(results).toBeVisible();
  const after = await hero.boundingBox();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.height ?? 0) - (before?.height ?? 0))).toBeLessThanOrEqual(2);
  await expect(results).toHaveCSS("position", "absolute");
  await expect(results).toHaveCSS("opacity", "1");
  expect(await results.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    "rgba(0, 0, 0, 0)"
  );
});

test("markets visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/markets", "Artist Markets", "markets.png");
});

test("markets search avoids a partial input outline", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

  const search = page.getByRole("textbox", { name: "Search artist or ticker" });
  await search.focus();

  await expect(search).toHaveCSS("outline-color", "rgba(0, 0, 0, 0)");
});

test("news visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/news", "Market News", "news.png");
});

test("about visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/about", "A fantasy market for following rapper momentum.", "about.png");
});

test("help visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/help", "How can we help?", "help.png");
});

test("help feedback can be submitted without signing in", async ({ page }) => {
  let submittedBody: Record<string, unknown> | null = null;
  await page.route("**/api/feedback", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });
  await page.goto("/help");

  await page.getByLabel("Category").selectOption("data");
  await page.getByLabel("Contact email").fill("trader@example.com");
  await page.getByLabel("Message").fill("The latest quote appears to use the wrong source data.");
  await page.getByRole("button", { name: "Send Feedback" }).click();

  await expect(page.getByText("Thanks—your feedback was sent.")).toBeVisible();
  expect(submittedBody).toMatchObject({
    category: "data",
    contactEmail: "trader@example.com",
    message: "The latest quote appears to use the wrong source data."
  });
});

test("onboarding watchlist selections stay visibly selected", async ({ page }) => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const timestamp = "2026-07-21T12:00:00.000Z";
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "onboarding@example.com",
    email_confirmed_at: timestamp,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { username: "OnboardingTester" },
    identities: [],
    created_at: timestamp,
    updated_at: timestamp
  };
  const session = {
    access_token: createTestAccessToken(userId),
    refresh_token: "onboarding-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user
  };

  await page.addInitScript((value) => {
    window.localStorage.setItem("sb-example-auth-token", JSON.stringify(value));
  }, session);
  await page.route("https://example.supabase.co/auth/v1/user", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(user) })
  );
  await page.route("**/api/profile/bootstrap", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        profile: {
          id: userId,
          username: "OnboardingTester",
          cashBalance: 100_000,
          favoriteArtistIds: [],
          onboardingCompleted: false,
          isAdmin: false
        },
        holdings: [],
        shortPositions: [],
        transactions: []
      })
    })
  );
  await page.route("**/api/watchlist", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, watchlist: [] }) })
  );

  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Add artists to your watchlist" })).toBeVisible();
  await expect(page.getByText("Choose your rap lanes")).toHaveCount(0);

  const artistChoices = page.locator("section button");
  await artistChoices.nth(0).click();
  await artistChoices.nth(1).click();
  await artistChoices.nth(2).click();

  await expect(page.getByLabel("Selected")).toHaveCount(3);
  await expect(page.getByText("3 of 5 selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("primary public pages do not overflow a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/", "/markets", "/news", "/about", "/help"]) {
    await page.goto(path);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));

    expect(dimensions.scrollWidth, `${path} overflowed horizontally`).toBeLessThanOrEqual(
      dimensions.clientWidth + 1
    );
  }
});

function createTestAccessToken(userId: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);

  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    sub: userId,
    email: "onboarding@example.com",
    role: "authenticated"
  })}.test-signature`;
}
