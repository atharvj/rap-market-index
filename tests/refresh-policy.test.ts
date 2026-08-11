import { describe, expect, it } from "vitest";
import {
  MARKET_CONTENT_REFRESH_MS,
  MARKET_OBSERVATION_REFRESH_MS,
  MARKET_SNAPSHOT_REFRESH_MS
} from "@/lib/refresh-policy";

describe("browser refresh policy", () => {
  it("refreshes quotes fastest and slower-changing content less often", () => {
    expect(MARKET_SNAPSHOT_REFRESH_MS).toBe(30_000);
    expect(MARKET_CONTENT_REFRESH_MS).toBe(60_000);
    expect(MARKET_OBSERVATION_REFRESH_MS).toBe(120_000);
    expect(MARKET_SNAPSHOT_REFRESH_MS).toBeLessThan(MARKET_CONTENT_REFRESH_MS);
    expect(MARKET_CONTENT_REFRESH_MS).toBeLessThan(MARKET_OBSERVATION_REFRESH_MS);
  });
});
