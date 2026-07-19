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
  await expect(page).toHaveScreenshot(snapshot, { fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await installPublicFixtures(page);
});

test("homepage visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/", "Spot the next rise.", "homepage.png");
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

test("news visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/news", "Market Intelligence", "news.png");
});

test("about visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/about", "The signal layer for rap momentum.", "about.png");
});

test("help visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/help", "How can we help?", "help.png");
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
