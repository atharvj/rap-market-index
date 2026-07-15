import { describe, expect, it } from "vitest";
import {
  normalizeMarketNewsSort,
  sortMarketNewsEvents
} from "@/lib/market-news-sort";

const events = [
  { id: "older-impact", event_date: "2026-07-10", created_at: null, impact_score: -90, confidence: 0.7 },
  { id: "newer-verified", event_date: "2026-07-13", created_at: null, impact_score: 35, confidence: 0.95 },
  { id: "newest", event_date: "2026-07-14", created_at: null, impact_score: 20, confidence: 0.6 }
];

describe("market news sorting", () => {
  it("defaults unknown sort values to top stories", () => {
    expect(normalizeMarketNewsSort("random")).toBe("top");
  });

  it("sorts latest stories chronologically", () => {
    expect(sortMarketNewsEvents(events, "latest").map((event) => event.id)).toEqual([
      "newest",
      "newer-verified",
      "older-impact"
    ]);
  });

  it("uses absolute impact and confidence for their respective modes", () => {
    expect(sortMarketNewsEvents(events, "impact")[0].id).toBe("older-impact");
    expect(sortMarketNewsEvents(events, "confidence")[0].id).toBe("newer-verified");
  });

  it("accepts the route's composite score for top stories", () => {
    expect(sortMarketNewsEvents(events, "top", (event) => event.id === "newer-verified" ? 100 : 0)[0].id)
      .toBe("newer-verified");
  });
});
