import { describe, expect, it } from "vitest";
import { DEFAULT_MARKET_MODEL_VERSION, getMarketModelVersion } from "@/server/market/model-version";

describe("market model version", () => {
  it("uses the current built-in model when no override is configured", () => {
    const previous = process.env.MARKET_MODEL_VERSION;
    delete process.env.MARKET_MODEL_VERSION;

    expect(getMarketModelVersion()).toBe(DEFAULT_MARKET_MODEL_VERSION);

    if (previous !== undefined) {
      process.env.MARKET_MODEL_VERSION = previous;
    }
  });
});
