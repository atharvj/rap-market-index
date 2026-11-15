import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  events: [] as Record<string, unknown>[],
  artists: [
    { id: "j-cole", name: "J. Cole", ticker: "JCOLE", category: "superstar" },
    { id: "drake", name: "Drake", ticker: "DRAKE", category: "superstar" },
    { id: "future", name: "Future", ticker: "FUTR", category: "superstar" },
    {
      id: "lil-baby",
      name: "Lil Baby",
      ticker: "LBABY",
      category: "mainstream",
    },
    {
      id: "bigxthaplug",
      name: "BigXthaPlug",
      ticker: "BIGX",
      category: "mainstream",
    },
  ],
}));
vi.mock("@/server/observability", () => ({ reportServerError: vi.fn() }));
vi.mock("@/server/market/artist-images", () => ({
  loadArtistImageUrls: async () => new Map(),
}));
vi.mock("@/server/market/source-preview-images", () => ({
  loadSourcePreviewImageUrls: async () => new Map(),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({
    readyForPublicReads: true,
    serviceRoleConfigured: true,
  }),
  createServiceRoleClient: () => ({
    from(table: string) {
      let artistFilter: string | undefined;
      let typeFilter: string[] | undefined;
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          if (key === "artist_id") artistFilter = String(value);
          if (key === "event_type") typeFilter = [String(value)];
          return builder;
        },
        in: (key: string, values: string[]) => {
          if (key === "event_type") typeFilter = values;
          return builder;
        },
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === "artists"
                ? mocks.artists
                : mocks.events.filter(
                    (e) =>
                      (!artistFilter || e.artist_id === artistFilter) &&
                      (!typeFilter ||
                        typeFilter.includes(String(e.event_type))),
                  ),
            error: null,
          }).then(resolve),
      };
      return builder;
    },
  }),
}));
import { GET } from "../app/api/market/news/route";
const row = (
  id: string,
  artist_id: string,
  title: string,
  event_type = "release",
  reason = "release_terms",
  extra = {},
) => ({
  id,
  artist_id,
  title,
  event_date: "2026-11-11",
  created_at: "2026-11-11T12:00:00Z",
  event_type,
  impact_score: event_type === "viral" ? 46 : 52,
  sentiment_score: 34,
  confidence: 0.9,
  source_url: `https://complex.com/music/${id}`,
  source_name: "Complex",
  raw_payload: {
    source: "media_rss_item",
    domain: "complex.com",
    sourceTier: 3,
    classificationReason: reason,
    publisherArticleVerified: true,
    publisherHeadlineVerified: true,
    publisherHeadline: title,
    ...extra,
  },
});
beforeEach(() => {
  mocks.events = [
    row(
      "obituary",
      "j-cole",
      "Disco Legend Whose Music Was Covered by Mary J. Blige and Sampled by J. Cole Dead at 72",
      "news",
      "artist_death_status",
      { statusSubtype: "death" },
    ),
    row(
      "policy",
      "drake",
      "Drake Slams Billboard's New Streaming Rules as YouTube Returns to Charts",
      "viral",
      "chart_terms",
    ),
    row(
      "shopping",
      "lil-baby",
      "Get a Signed Copy of Lil Baby's New Album 'Fresh' and a Matching Beanie",
    ),
    row(
      "reaction",
      "lil-baby",
      "Joe Budden Couldn’t Have Been Less Enthusiastic While Listening To Lil Baby’s New Album",
    ),
    row(
      "chart",
      "bigxthaplug",
      "BigXthaPlug Scores His First No. 1 Rap Album With ‘Better Over Time’",
      "viral",
      "chart_terms",
    ),
    row(
      "song-one",
      "drake",
      'Drake Reunites With Travis Scott on New Future Track "Ya Hit" f/ Loe Shimmy and Sexyy Red',
      "viral",
      "major_feature_terms",
    ),
    row(
      "song-two",
      "future",
      "Ya Hit – Song by Future featuring Drake, Travis Scott, & Loe Shimmy",
      "viral",
      "major_feature_terms",
    ),
  ];
});
it("filters irrelevant stored stories and duplicate recording coverage in the actual public API", async () => {
  const response = await GET(
    new Request(
      "https://rmi.test/api/market/news?feed=news&sort=top&limit=9&runDate=2026-11-14",
    ),
  );
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.news.some((n: { id: string }) => n.id === "chart")).toBe(true);
  expect(
    payload.news.filter((n: { id: string }) => n.id.startsWith("song-")).length,
  ).toBe(1);
  for (const id of ["obituary", "policy", "shopping", "reaction"])
    expect(payload.news.some((n: { id: string }) => n.id === id)).toBe(false);
});
it("shows a bounded negative listening opinion on the artist page with the corrected label", async () => {
  const response = await GET(
    new Request(
      "https://rmi.test/api/market/news?artistId=lil-baby&feed=artist&sort=latest&runDate=2026-11-14",
    ),
  );
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(
    payload.news.find((n: { id: string }) => n.id === "reaction"),
  ).toMatchObject({
    eventType: "review",
    impactScore: -18,
    sentimentScore: -18,
  });
  expect(payload.news.some((n: { id: string }) => n.id === "shopping")).toBe(
    false,
  );
});
it("does not remove new music or real chart results just because a publisher ran other weak stories", async () => {
  mocks.events = [
    row("release", "lil-baby", "Lil Baby releases new album Fresh"),
    row(
      "chart",
      "bigxthaplug",
      "BigXthaPlug Scores His First No. 1 Rap Album With ‘Better Over Time’",
      "viral",
      "chart_terms",
    ),
  ];
  const response = await GET(
    new Request("https://rmi.test/api/market/news?limit=9&runDate=2026-11-14"),
  );
  expect(
    (await response.json()).news.map((n: { id: string }) => n.id).sort(),
  ).toEqual(["chart", "release"]);
});
it("applies the corrected type consistently to the artist's review and release filters", async () => {
  const reviews = await GET(
    new Request(
      "https://rmi.test/api/market/news?artistId=lil-baby&eventType=review&runDate=2026-11-14",
    ),
  );
  expect(
    (await reviews.json()).news.find(
      (n: { id: string }) => n.id === "reaction",
    ),
  ).toMatchObject({ eventType: "review", impactScore: -18 });
  const releases = await GET(
    new Request(
      "https://rmi.test/api/market/news?artistId=lil-baby&eventType=release&runDate=2026-11-14",
    ),
  );
  expect(
    (await releases.json()).news.some(
      (n: { id: string }) => n.id === "reaction",
    ),
  ).toBe(false);
});
