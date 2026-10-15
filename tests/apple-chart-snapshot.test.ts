import { describe, expect, it } from "vitest";
import { mergeSameDayAppleSnapshots } from "@/server/market/apple-chart-snapshot";
const stamp = "2026-10-15T06:00:00Z";
const saved = { runDate: "2026-10-15", scores: { us: 80, gb: 30, ca: 20 }, chartUpdatedAt: { us: stamp, gb: stamp, ca: stamp },
  tracks: [{ storefront: "us", title: "Actual US song" }, { storefront: "gb", title: "Old GB song" }] };
const partial = { runDate: "2026-10-15", scores: { gb: 32, ca: 20 }, chartUpdatedAt: { gb: stamp, ca: stamp }, tracks: [{ storefront: "gb", title: "Current GB song" }], missingKeys: ["us"] };
describe("same-day Apple snapshot retention", () => {
  it("retains missing country evidence and its real provider timestamp without mutating the fresh scan", () => {
    const merged = mergeSameDayAppleSnapshots(partial, saved);
    expect(merged).toMatchObject({ scores: { us: 80, gb: 32, ca: 20 }, chartUpdatedAt: { us: stamp }, retainedKeys: ["us"], missingKeys: ["us"] });
    expect(merged.tracks).toEqual([{ storefront: "gb", title: "Current GB song" }, { storefront: "us", title: "Actual US song" }]);
    expect(partial.scores).toEqual({ gb: 32, ca: 20 });
  });
  it("does not fill missing countries with yesterday's ranks", () => {
    expect(mergeSameDayAppleSnapshots(partial, { ...saved, runDate: "2026-10-14" })).toBe(partial);
  });
  it("keeps the newer provider revision even if a stale response was fetched later", () => {
    const old = { ...saved, scores: { us: 0 }, chartUpdatedAt: { us: "2026-10-15T05:00:00Z" } };
    expect(mergeSameDayAppleSnapshots(old, saved)).toMatchObject({ scores: { us: 80 }, chartUpdatedAt: { us: stamp } });
    expect(mergeSameDayAppleSnapshots(saved, old)).toBe(saved);
  });
  it("rejects invalid retained values and unproven provider timestamps", () => {
    expect(mergeSameDayAppleSnapshots(partial, { ...saved, scores: { us: NaN }, chartUpdatedAt: { us: stamp } })).toBe(partial);
    expect(mergeSameDayAppleSnapshots(partial, { ...saved, scores: { us: 80 }, chartUpdatedAt: { us: "invalid" } })).toBe(partial);
  });
  it("does not erase retained track metadata while folding another partial row", () => {
    const merged = mergeSameDayAppleSnapshots(partial, saved);
    expect(mergeSameDayAppleSnapshots(merged, partial).tracks).toEqual(merged.tracks);
  });
  it("ignores malformed saved track entries and invalid market dates", () => {
    const merged = mergeSameDayAppleSnapshots(partial, { ...saved, tracks: [null, "invalid", {}, ...saved.tracks] });
    expect(merged.tracks).toEqual([{ storefront: "gb", title: "Current GB song" }, { storefront: "us", title: "Actual US song" }]);
    const invalid = { ...partial, runDate: "invalid" };
    expect(mergeSameDayAppleSnapshots(invalid, { ...saved, runDate: "invalid" })).toBe(invalid);
  });
});
