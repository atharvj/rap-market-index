import { describe, expect, it } from "vitest";
import {
  evaluateMarketModel,
  type ValidationAudienceObservation,
  type ValidationSignalSnapshot
} from "@/server/market/model-validation";

function snapshot(artistId: string, strength: number): ValidationSignalSnapshot {
  return {
    artistId,
    sourceDate: "2026-06-15",
    streamingGrowth: strength,
    youtubeGrowth: strength,
    searchGrowth: strength,
    socialGrowth: strength,
    newsScore: 50 + strength,
    traderDemand: 0
  };
}

function observations(artistId: string, acceleration: number): ValidationAudienceObservation[] {
  const current = 1000 + acceleration * 10;

  return [
    { artistId, source: "lastfm", metric: "listeners", observedDate: "2026-06-08", value: 1000 },
    { artistId, source: "lastfm", metric: "listeners", observedDate: "2026-06-15", value: current },
    {
      artistId,
      source: "lastfm",
      metric: "listeners",
      observedDate: "2026-06-22",
      value: current + acceleration * 40
    }
  ];
}

describe("market model validation", () => {
  it("does not borrow a future listener observation for the signal-date baseline", () => {
    const points = observations("artist", 10).map(row => row.observedDate === "2026-06-15" ? { ...row, observedDate: "2026-06-16" } : row);
    expect(evaluateMarketModel({ snapshots: [snapshot("artist", 10)], observations: points }).sampleCount).toBe(0);
  });
  it("evaluates the executed price signal when supplied rather than substituting a hype-score proxy", () => {
    const ids = ["a", "b", "c", "d"];
    const result = evaluateMarketModel({ snapshots: ids.map((id, i) => ({ ...snapshot(id, 100 - i), priceSignalPercent: i })),
      observations: ids.flatMap((id, i) => observations(id, i + 1)) });
    expect(result.rankCorrelation).toBeGreaterThan(0.9);
  });
  it("measures whether stronger signals rank with subsequent audience acceleration", () => {
    const artistIds = Array.from({ length: 12 }, (_, index) => `artist-${index}`);
    const result = evaluateMarketModel({
      snapshots: artistIds.map((artistId, index) => snapshot(artistId, index - 5)),
      observations: artistIds.flatMap((artistId, index) => observations(artistId, index + 1)),
      horizonDays: 7
    });

    expect(result.sampleCount).toBe(12);
    expect(result.rankCorrelation).not.toBeNull();
    expect(result.rankCorrelation ?? 0).toBeGreaterThan(0.9);
    expect(result.topBottomAudienceLift).not.toBeNull();
    expect(result.sourceMetricSampleCounts["lastfm:listeners"]).toBe(12);
  });

  it("reports collection status instead of claiming accuracy without outcomes", () => {
    const result = evaluateMarketModel({
      snapshots: [snapshot("artist", 10)],
      observations: [],
      horizonDays: 7
    });

    expect(result.status).toBe("collecting");
    expect(result.sampleCount).toBe(0);
    expect(result.rankCorrelation).toBeNull();
    expect(result.note).toContain("Do not claim measured predictive accuracy");
  });
});
