import { describe, expect, it } from "vitest";
import { isPendingCatalyst } from "@/server/market/pending-catalyst";

const now = new Date("2026-07-22T04:15:00.000Z");

describe("pending market catalysts", () => {
  it("pauses for an event detected after the latest quote", () => {
    expect(isPendingCatalyst({
      event: {
        createdAt: "2026-07-22T04:10:00.000Z",
        eventDate: "2026-07-22",
        eventType: "news"
      },
      quotedAt: "2026-07-22T04:00:00.000Z",
      now
    })).toBe(true);
  });

  it("pauses a previously announced release once its Eastern release date starts", () => {
    expect(isPendingCatalyst({
      event: {
        createdAt: "2026-07-01T12:00:00.000Z",
        eventDate: "2026-07-22",
        eventType: "release"
      },
      quotedAt: "2026-07-22T03:59:59.000Z",
      now
    })).toBe(true);
  });

  it("clears the scheduled release pause after a quote for the new market date", () => {
    expect(isPendingCatalyst({
      event: {
        createdAt: "2026-07-01T12:00:00.000Z",
        eventDate: "2026-07-22",
        eventType: "release"
      },
      quotedAt: "2026-07-22T04:10:00.000Z",
      now
    })).toBe(false);
  });

  it("does not pause old non-release events", () => {
    expect(isPendingCatalyst({
      event: {
        createdAt: "2026-07-01T12:00:00.000Z",
        eventDate: "2026-07-22",
        eventType: "tour"
      },
      quotedAt: "2026-07-22T04:10:00.000Z",
      now
    })).toBe(false);
  });
});
