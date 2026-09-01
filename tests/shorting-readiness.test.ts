import { describe, expect, it } from "vitest";
import { getShortingReadiness, MIN_SHORTING_RECORDED_SESSIONS } from "@/lib/shorting-readiness";

function buildHistory(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    price: 50 + index * 0.03
  }));
}

describe("shorting readiness", () => {
  it("keeps new artist listings ineligible until they have enough sessions", () => {
    const readiness = getShortingReadiness(buildHistory(12));

    expect(readiness.dataReady).toBe(false);
    expect(readiness.reason).toContain(`12/${MIN_SHORTING_RECORDED_SESSIONS}`);
  });

  it("automatically enables a mature moving quote", () => {
    const readiness = getShortingReadiness(buildHistory(MIN_SHORTING_RECORDED_SESSIONS));

    expect(readiness.dataReady).toBe(true);
    expect(readiness.enabled).toBe(true);
    expect(readiness.reason).toBe("Short selling available.");
  });

  it("does not qualify a flat placeholder series", () => {
    const history = buildHistory(MIN_SHORTING_RECORDED_SESSIONS).map((point) => ({ ...point, price: 50 }));

    expect(getShortingReadiness(history).dataReady).toBe(false);
  });

  it("does not use old movement to qualify a recently flat quote", () => {
    const history = buildHistory(70).map((point, index) => ({
      ...point,
      price: index < 30 ? point.price : 55
    }));

    expect(getShortingReadiness(history).dataReady).toBe(false);
  });
});
