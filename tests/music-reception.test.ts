import { describe, expect, it } from "vitest";
import { scoreMusicReception } from "@/server/market/music-reception";

describe("explicit listener ratings", () => {
  it.each([["0/10", -100], ["2/10", -60], ["5/10", 0], ["8.5/10", 70], ["10/10", 100]])("reads %s without losing the denominator or decimal", (rating, score) => {
    expect(scoreMusicReception(`Album review: ${rating}`)).toBeCloseTo(Number(score));
  });
  it("does not interpret URLs, dates, out-of-range or negated scores as praise", () => {
    for (const text of ["https://example.com/10/10", "1010/10", "12/10", "not 10/10", "10/10 /s", "I listened on 10/14"])
      expect(scoreMusicReception(text)).toBe(0);
    expect(scoreMusicReception("10/10 if you enjoy trash")).toBeLessThan(0);
  });
  it("preserves negation instead of turning criticism into approval", () => {
    expect(scoreMusicReception("album isn't fire")).toBeLessThan(0);
    expect(scoreMusicReception("album isn't trash")).toBeGreaterThan(0);
  });
});
