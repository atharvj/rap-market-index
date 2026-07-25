import { describe, expect, it } from "vitest";
import { getMarketNewsCandidateLimit } from "@/server/market/news-candidate-limit";

describe("market news candidate limits", () => {
  it("ranks the same full pool for top stories regardless of display limit", () => {
    const homepagePool = getMarketNewsCandidateLimit({
      feedMode: "news",
      limit: 1,
      sort: "top"
    });
    const newsPagePool = getMarketNewsCandidateLimit({
      feedMode: "news",
      limit: 40,
      sort: "top"
    });

    expect(homepagePool).toBe(500);
    expect(newsPagePool).toBe(homepagePool);
  });

  it("keeps bounded over-fetching for latest feeds and a full Watch Now pool", () => {
    expect(getMarketNewsCandidateLimit({
      feedMode: "news",
      limit: 12,
      sort: "latest"
    })).toBe(72);
    expect(getMarketNewsCandidateLimit({
      feedMode: "watch",
      limit: 8,
      sort: "latest"
    })).toBe(500);
  });
});
