import { describe, expect, it } from "vitest";
import { hasMaterialMarketImpact } from "@/lib/market-news-impact";

describe("market news impact eligibility", () => {
  it("treats equally strong gains and losses as material market stories", () => {
    expect(hasMaterialMarketImpact(45, 22)).toBe(true);
    expect(hasMaterialMarketImpact(-45, 22)).toBe(true);
  });

  it("still filters weak or invalid impact values", () => {
    expect(hasMaterialMarketImpact(0, 22)).toBe(false);
    expect(hasMaterialMarketImpact(-21.99, 22)).toBe(false);
    expect(hasMaterialMarketImpact(Number.NaN, 22)).toBe(false);
  });
});
