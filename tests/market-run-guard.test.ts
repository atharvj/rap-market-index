import { describe, expect, it } from "vitest";
import {
  getMarketRunSkipDecision,
  type ExistingMarketRun
} from "@/server/market/run-guard";

const baseRun: ExistingMarketRun = {
  run_date: "2026-07-16",
  status: "succeeded",
  source: "core",
  started_at: "2026-07-16T10:15:00.000Z",
  completed_at: "2026-07-16T10:20:00.000Z",
  summary: {},
  error_message: null
};

describe("market run guard", () => {
  it("skips a successful run only when every active artist has a close", () => {
    expect(
      getMarketRunSkipDecision({
        run: baseRun,
        source: "core",
        coverage: { activeArtistCount: 68, completedArtistCount: 68 }
      }).skip
    ).toBe(true);
  });

  it("retries a nominally successful run with incomplete close coverage", () => {
    const decision = getMarketRunSkipDecision({
      run: baseRun,
      source: "core",
      coverage: { activeArtistCount: 68, completedArtistCount: 25 }
    });

    expect(decision.skip).toBe(false);
    expect(decision.reason).toContain("25 of 68");
  });

  it("recovers a stale running job", () => {
    const decision = getMarketRunSkipDecision({
      run: {
        ...baseRun,
        status: "running",
        completed_at: null
      },
      source: "core",
      coverage: { activeArtistCount: 68, completedArtistCount: 0 },
      now: new Date("2026-07-16T10:30:01.000Z").getTime(),
      staleAfterMs: 10 * 60 * 1000
    });

    expect(decision.skip).toBe(false);
    expect(decision.reason).toContain("stale");
  });

  it("does not start a second copy while a recent job is running", () => {
    const decision = getMarketRunSkipDecision({
      run: {
        ...baseRun,
        status: "running",
        completed_at: null
      },
      source: "core",
      coverage: { activeArtistCount: 68, completedArtistCount: 0 },
      now: new Date("2026-07-16T10:20:00.000Z").getTime(),
      staleAfterMs: 10 * 60 * 1000
    });

    expect(decision.skip).toBe(true);
  });
});
