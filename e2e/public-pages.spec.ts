import { expect, test, type Page } from "@playwright/test";
import { createInitialGameState } from "../src/lib/market";
import type { GameState } from "../src/lib/types";

const dailyMoves = [4.8, 3.4, 2.1, 1.3, 0.7, 0.2, -0.3, -0.8, 1.8, -1.4, 0.9, -0.5, 2.7, -1.1, 1.2, -0.2];
const videoPoster = (label: string, color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#07111d"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
      <rect width="1280" height="720" fill="url(#g)"/>
      <circle cx="315" cy="350" r="190" fill="#ffffff" opacity=".08"/>
      <text x="620" y="330" fill="#ffffff" font-family="Arial" font-size="82" font-weight="700">${label}</text>
      <text x="624" y="400" fill="#ffffff" opacity=".62" font-family="Arial" font-size="30">OFFICIAL MUSIC VIDEO</text>
    </svg>
  `)}`;

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

const marketVideos = [
  {
    ...marketNews[0],
    id: "video-1",
    title: `${marketState.artists[1].name} - First Light (Official Music Video)`,
    sourceName: "YouTube",
    sourceDomain: "youtube.com",
    sourceUrl: "https://www.youtube.com/watch?v=RmiVideo001",
    thumbnailUrl: videoPoster(marketState.artists[1].ticker, "#075a66"),
    mediaUrl: "https://www.youtube.com/watch?v=RmiVideo001",
    mediaType: "youtube",
    mediaLabel: "Watch",
    videoId: "RmiVideo001",
    durationSeconds: 214,
    viewCount: 842_000
  },
  {
    ...marketNews[1],
    id: "video-2",
    title: `${marketState.artists[2].name} - Night Shift (Official Video)`,
    sourceName: "YouTube",
    sourceDomain: "youtube.com",
    sourceUrl: "https://www.youtube.com/watch?v=RmiVideo002",
    thumbnailUrl: videoPoster(marketState.artists[2].ticker, "#3f2468"),
    mediaUrl: "https://www.youtube.com/watch?v=RmiVideo002",
    mediaType: "youtube",
    mediaLabel: "Watch",
    videoId: "RmiVideo002",
    durationSeconds: 188,
    viewCount: 416_000
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
  await page.route("**/api/market/news**", (route) => {
    const requestUrl = new URL(route.request().url());
    const news = requestUrl.searchParams.get("feed") === "watch" ? marketVideos : marketNews;

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, news })
    });
  });
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => {
    const secondVideo = route.request().url().includes("RmiVideo002");
    const label = secondVideo ? marketState.artists[2].ticker : marketState.artists[1].ticker;
    const color = secondVideo ? "#3f2468" : "#075a66";

    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0;overflow:hidden;background:linear-gradient(120deg,#07111d,${color});color:white;font-family:Arial;display:grid;place-items:center;height:100vh"><div style="text-align:center"><b style="font-size:72px">${label}</b><div style="margin-top:14px;font-size:24px;opacity:.65">OFFICIAL MUSIC VIDEO</div></div><script>
        let currentTime = 24;
        const duration = ${secondVideo ? 188 : 214};
        window.addEventListener("message", (event) => {
          let payload;
          try { payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
          if (!payload || payload.event !== "command") return;
          document.body.dataset.commands = (document.body.dataset.commands || "") + "," + payload.func;
          if (payload.func === "seekTo") {
            currentTime = Number(payload.args && payload.args[0]) || 0;
            document.body.dataset.seek = String(currentTime);
          }
          if (payload.func === "setOption" && payload.args && payload.args[0] === "captions") {
            document.body.dataset.captions = Object.keys(payload.args[2] || {}).length ? "on" : "off";
          }
          if (payload.func === "getCurrentTime" || payload.func === "getDuration") {
            window.parent.postMessage(JSON.stringify({
              event: "infoDelivery",
              info: { currentTime, duration }
            }), "*");
          }
        });
      </script></body></html>`
    });
  });
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

async function installPortfolioFixture(page: Page) {
  const userId = "22222222-2222-4222-8222-222222222222";
  const timestamp = "2026-07-21T12:00:00.000Z";
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "portfolio@example.com",
    email_confirmed_at: timestamp,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { username: "PortfolioTester" },
    identities: [],
    created_at: timestamp,
    updated_at: timestamp
  };
  const session = {
    access_token: createTestAccessToken(userId),
    refresh_token: "portfolio-refresh-token",
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
          username: "PortfolioTester",
          cashBalance: 17_500,
          favoriteArtistIds: [],
          onboardingCompleted: true,
          isAdmin: false
        },
        holdings: [
          {
            artistId: marketState.artists[0].id,
            shares: 20,
            averageBuyPrice: Number((marketState.artists[0].currentPrice * 0.8).toFixed(2))
          },
          {
            artistId: marketState.artists[1].id,
            shares: 8,
            averageBuyPrice: Number((marketState.artists[1].currentPrice * 1.1).toFixed(2))
          }
        ],
        shortPositions: [],
        transactions: []
      })
    })
  );
  await page.route("**/api/watchlist", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, watchlist: [] }) })
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
  await assertStablePublicPage(page, "/", marketNews[0].title, "homepage.png");
  await expect(page.getByText("Top Market Story", { exact: true })).toBeVisible();
});

test("homepage leads with one top story and does not repeat it below", async ({ page }) => {
  const newsRequests: URL[] = [];
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());

    if (requestUrl.pathname === "/api/market/news") {
      newsRequests.push(requestUrl);
    }
  });

  await page.goto("/");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText(marketNews[0].title, { exact: true })).toHaveCount(1);
  await expect(page.getByText(marketNews[1].title, { exact: true })).toBeVisible();
  expect(
    newsRequests.some((requestUrl) =>
      requestUrl.searchParams.get("feed") === "news" &&
      requestUrl.searchParams.get("limit") === "1" &&
      requestUrl.searchParams.get("sort") === "top"
    )
  ).toBeTruthy();
  expect(newsRequests.some((requestUrl) => requestUrl.searchParams.get("feed") === "home")).toBeFalsy();
  await expect(
    page.getByRole("link", { name: `View ${marketNews[0].artistName} market` })
  ).toHaveText("View artist market");
});

test("Watch Now starts in view and stays inside the RMI player", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

  const section = page.getByRole("heading", { name: "Watch Now" });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  await expect(page.locator('iframe[title*="video player"]')).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/RmiVideo001/
  );
  const youtubeLink = page.getByRole("link", { name: /open .* on youtube/i });
  await expect(youtubeLink).toHaveCount(1);
  await expect(youtubeLink).toHaveAttribute(
    "href",
    `https://www.youtube.com/watch?v=${marketVideos[0].videoId}`
  );
  await expect(youtubeLink).toHaveAttribute("target", "_blank");
  await expect(
    page.getByRole("link", { name: `${marketVideos[0].artistName} artist page` })
  ).toHaveAttribute("href", `/artists/${marketVideos[0].artistId}`);
  await expect(page.locator('section[aria-labelledby="watch-now-title"]')).toHaveScreenshot("watch-now.png");

  const player = page.locator("[data-watch-player]");
  const [playerBox, youtubeLinkBox] = await Promise.all([
    player.boundingBox(),
    youtubeLink.boundingBox()
  ]);
  expect(playerBox).not.toBeNull();
  expect(youtubeLinkBox).not.toBeNull();
  expect(youtubeLinkBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height);
  const controls = page.locator("[data-watch-controls]");
  await player.hover();
  await expect(controls).toHaveClass(/opacity-100/);
  await page.mouse.move(1, 1);
  await expect(controls).toHaveClass(/opacity-0/, { timeout: 3_000 });
  await player.hover();
  await expect(controls).toHaveClass(/opacity-100/);

  await page.evaluate(() => {
    let fullscreenElement: Element | null = null;

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: async function requestFullscreen() {
        fullscreenElement = this;
        document.dispatchEvent(new Event("fullscreenchange"));
      }
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: async () => {
        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      }
    });
  });
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect(page.getByRole("button", { name: "Enter fullscreen" })).toBeVisible();

  const playerFrame = page.frames().find((frame) => frame.url().includes("youtube-nocookie.com/embed/RmiVideo001"));
  expect(playerFrame).toBeDefined();
  await page.getByRole("button", { name: "Pause current video" }).click();
  await expect(page.getByRole("button", { name: "Play current video" })).toBeVisible();
  await page.getByRole("button", { name: "Play current video" }).click();
  await expect(page.getByRole("button", { name: "Pause current video" })).toBeVisible();

  await page.getByRole("button", { name: "Turn captions on" }).click();
  await expect(page.getByRole("button", { name: "Turn captions off" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => playerFrame?.locator("body").getAttribute("data-captions")).toBe("on");

  const progress = page.getByRole("slider", { name: "Video progress" });
  await progress.fill("90");
  await expect.poll(() => playerFrame?.locator("body").getAttribute("data-seek")).toBe("90");

  await playerFrame?.evaluate(() => {
    window.parent.postMessage(JSON.stringify({ event: "onStateChange", info: 0 }), "*");
  });
  await expect(page.getByRole("heading", { name: marketVideos[1].title })).toBeVisible();
  await expect(page.locator('iframe[title*="video player"]')).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/RmiVideo002/
  );
  await page.getByRole("button", { name: "Previous video" }).click();
  await expect(page.getByRole("heading", { name: marketVideos[0].title })).toBeVisible();
  await page.getByRole("button", { name: "Unmute video" }).click();
  await expect(page.getByRole("button", { name: "Mute video" })).toBeVisible();
});

test("markets visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/markets", "Artist Markets", "markets.png");
});

test("market artist names retain readable space on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/markets");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

  const names = page.locator("[data-market-artist-name]");
  await expect(names).toHaveCount(marketState.artists.length);

  const widths = await names.evaluateAll((nodes) =>
    nodes.slice(0, 8).map((node) => Math.round(node.getBoundingClientRect().width))
  );
  expect(widths.every((width) => width >= 80), `mobile artist-name widths: ${widths.join(", ")}`).toBeTruthy();
});

test("artist pages include related markets without repeating the current artist", async ({ page }) => {
  const currentArtist = marketState.artists[0];
  await page.goto(`/artists/${currentArtist.id}`);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

  const heading = page.getByRole("heading", { name: "Related Artists" });
  await expect(heading).toBeVisible();
  const section = page.locator("section").filter({ has: heading }).first();
  await expect(section.locator('a[href^="/artists/"]')).toHaveCount(4);
  await expect(section.locator(`a[href="/artists/${currentArtist.id}"]`)).toHaveCount(0);
  await expect(page.getByText(/The chart shows market quotes, not individual order fills\./)).toBeVisible();
});

test("public metrics do not use decorative colored side borders", async ({ page }) => {
  for (const path of ["/", "/markets", "/scout"]) {
    await page.goto(path);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

    const metrics = page.locator(".rmi-metric");
    await expect(metrics.first()).toBeVisible();
    const pseudoElements = await metrics.evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element, "::before");
        return { content: style.content, width: style.width };
      })
    );

    expect(
      pseudoElements.every(({ content, width }) => content === "none" || width === "0px"),
      `${path} rendered a metric side accent`
    ).toBeTruthy();
    await expect(
      page.locator(
        '[class*="border-l-cyan"], [class*="border-l-mint"], [class*="border-l-ember"], [class*="border-l-brass"], [class*="border-l-violet"]'
      )
    ).toHaveCount(0);
  }
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

test("help topics stay in one compact expandable column", async ({ page }) => {
  await page.goto("/help");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

  const topics = page.locator("main details");
  await expect(topics).toHaveCount(7);
  await expect(page.locator("main details[open]")).toHaveCount(0);

  const topicPositions = await topics.evaluateAll((nodes) =>
    nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      return { x: Math.round(bounds.x), width: Math.round(bounds.width) };
    })
  );
  expect(new Set(topicPositions.map(({ x }) => x)).size).toBe(1);
  expect(new Set(topicPositions.map(({ width }) => width)).size).toBe(1);

  await page.getByText("Buy and sell artist shares", { exact: true }).click();
  await expect(page.locator("details#trading")).toHaveAttribute("open", "");
  await expect(page.locator("details#account")).not.toHaveAttribute("open", "");

  await page.goto("/help#trading");
  await expect(page.locator("details#trading")).toHaveAttribute("open", "");
});

test("privacy visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/privacy", "Privacy Policy", "privacy.png");
});

test("terms visual contract", async ({ page }) => {
  await assertStablePublicPage(page, "/terms", "Terms of Use", "terms.png");
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
          cashBalance: 25_000,
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
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your opening balance" })).toBeVisible();
  await expect(page.getByRole("paragraph").filter({ hasText: "$25,000" })).toBeVisible();
});

test("portfolio shows purchase basis and unrealized position performance", async ({ page }) => {
  await installPortfolioFixture(page);
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { level: 1, name: "Your Portfolio" })).toBeVisible();
  await expect(page.locator(".rmi-table-head")).toContainText("Avg. Fill");
  await expect(page.getByText("Position Cost", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Market Value", { exact: true }).first()).toBeVisible();
  await expect(
    page.locator(".hidden.overflow-x-auto.xl\\:block").getByText("Unrealized P/L", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Holdings Cost", { exact: true })).toBeVisible();
  const desktopHoldings = page.locator(".hidden.overflow-x-auto.xl\\:block");
  const averageFillInfo = desktopHoldings.getByRole("button", { name: "Explain average fill price" });
  await averageFillInfo.hover();
  await expect(desktopHoldings.getByRole("tooltip")).toHaveText(
    "Your average price paid per share. Buys can fill slightly above the chart price."
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".xl\\:hidden").first()).toContainText("Avg. fill");
  await expect(page.getByText("Current price", { exact: true }).first()).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
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
