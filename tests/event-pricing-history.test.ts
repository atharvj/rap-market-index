import { describe, expect, it } from "vitest";
import { priceNewEventEvidence } from "@/server/market/event-pricing-history";

const event = (impact = 40, overrides = {}) => ({
  event: { artistId: "drake", eventDate: "2026-10-12", eventType: "viral", title: "Drake Habibti jumps to No. 2 on Billboard 200",
    sourceUrl: "https://publisher.test/chart" }, weightedImpact: impact, shockWeightedImpact: impact, ...overrides
});
describe("event pricing history", () => {
  it("keeps an actual project release distinct from its earlier announcement at the same URL", () => {
    const announcement = event(25, { eventSubtype: "project_announcement" });
    const first = priceNewEventEvidence([announcement], undefined, "2026-10-12", "drake");
    const released = event(45, { eventSubtype: "project_release" });
    expect(priceNewEventEvidence([released], { pricingHistory: first.history }, "2026-10-13", "drake").events[0].weightedImpact).toBe(45);
  });
  it("does not compound a still-visible story over subsequent days or refund it as it decays", () => {
    let previous: unknown;
    const impacts = [];
    for (let day = 12; day <= 31; day++) {
      const priced = priceNewEventEvidence([event(40 * 0.9 ** (day - 12))], previous, `2026-10-${day}`, "drake");
      impacts.push(priced.events[0].weightedImpact);
      previous = { pricingHistory: priced.history };
    }
    expect(impacts[0]).toBe(40);
    expect(impacts.slice(1)).toEqual(Array(19).fill(0));
  });
  it("prices only the increase in stronger evidence, not the whole story again", () => {
    const first = priceNewEventEvidence([event()], undefined, "2026-10-12", "drake");
    const stronger = priceNewEventEvidence([event(60)], { pricingHistory: first.history }, "2026-10-13", "drake");
    expect(stronger.events[0].weightedImpact).toBe(20);
    expect(stronger.events[0].shockWeightedImpact).toBe(20);
  });
  it("keeps same-day recalculation deterministic and admits genuine new events and adverse revisions", () => {
    const first = priceNewEventEvidence([event()], undefined, "2026-10-12", "drake");
    const baseline = { pricingHistory: first.history };
    const input = [event(-30), event(25, { event: { ...event().event, title: "Drake announces arena tour", eventType: "tour", sourceUrl: "https://publisher.test/tour" } })];
    const next = priceNewEventEvidence(input, baseline, "2026-10-13", "drake");
    expect(next.events.map(e => e.weightedImpact)).toEqual([-30, 25]);
    expect(priceNewEventEvidence(input, baseline, "2026-10-13", "drake")).toEqual(next);
    expect(priceNewEventEvidence(input, { pricingHistory: next.history }, "2026-10-14", "drake").events.map(e => e.weightedImpact)).toEqual([0, 0]);
  });
  it("migrates actual legacy priced events so a model upgrade cannot replay them", () => {
    const previous = { events: [{ title: event().event.title, eventDate: "2026-10-12", eventType: "viral", weightedImpact: 40 }] };
    expect(priceNewEventEvidence([event(35)], previous, "2026-10-13", "drake").events[0].weightedImpact).toBe(0);
  });
  it("keeps a verified publisher headline joined to its legacy synthesized title on upgrade", () => {
    const current = event(35, { event: { ...event().event, title: "Drake - HABIBTI",
      rawPayload: { inferredReleaseTitle: "Drake - HABIBTI", publisherArticleVerified: true,
        publisherHeadlineVerified: true, publisherHeadline: "Drake releases HABIBTI deluxe with four new songs" } } });
    const previous = { events: [{ title: "Drake - HABIBTI", eventDate: "2026-10-12", eventType: "viral", weightedImpact: 40 }] };
    const next = priceNewEventEvidence([current], previous, "2026-10-13", "drake");
    expect(next.events[0].weightedImpact).toBe(0);
  });
  it("fails closed on corrupt, future or another artist's pricing history", () => {
    const first = priceNewEventEvidence([event()], undefined, "2026-10-12", "drake");
    expect(() => priceNewEventEvidence([event()], { pricingHistory: first.history }, "2026-10-12", "drake")).toThrow(/verify/);
    expect(() => priceNewEventEvidence([event()], { pricingHistory: first.history }, "2026-10-13", "ye")).toThrow(/verify/);
    expect(() => priceNewEventEvidence([event()], { pricingHistory: {} }, "2026-10-13", "drake")).toThrow(/verify/);
  });
});
