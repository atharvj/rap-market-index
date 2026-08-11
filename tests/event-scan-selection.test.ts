import { describe, expect, it } from "vitest";
import { selectArtistsByOldestCoverage } from "@/server/market/event-scan-selection";

const artists = [
  { id: "alpha", ticker: "$ALPHA" },
  { id: "beta", ticker: "$BETA" },
  { id: "gamma", ticker: "$GAMMA" }
];

describe("event scan artist rotation", () => {
  it("prioritizes artists missing coverage, then the oldest enabled coverage", () => {
    expect(selectArtistsByOldestCoverage({
      artists,
      latestDateMaps: [{ alpha: "2026-08-10", beta: "2026-08-09" }],
      limit: 3
    }).map((artist) => artist.id)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("ignores stale dates from sources that are not enabled for the run", () => {
    const mediaDates = {
      alpha: "2026-08-11",
      beta: "2026-08-09",
      gamma: "2026-08-10"
    };
    const disabledAiDates = {
      alpha: "2026-01-01",
      beta: "2026-08-11",
      gamma: "2026-08-11"
    };

    expect(selectArtistsByOldestCoverage({
      artists,
      latestDateMaps: [mediaDates],
      limit: 2
    }).map((artist) => artist.id)).toEqual(["beta", "gamma"]);

    expect(selectArtistsByOldestCoverage({
      artists,
      latestDateMaps: [mediaDates, disabledAiDates],
      limit: 2
    }).map((artist) => artist.id)).toEqual(["alpha", "beta"]);
  });

  it("applies the batch cap after deterministic oldest-first ordering", () => {
    expect(selectArtistsByOldestCoverage({
      artists,
      latestDateMaps: [{}],
      limit: 2
    }).map((artist) => artist.id)).toEqual(["alpha", "beta"]);
  });

  it("rotates artists scanned on the same day using their actual scan times", () => {
    expect(selectArtistsByOldestCoverage({
      artists,
      latestDateMaps: [{
        alpha: "2026-08-11T16:45:00.000Z",
        beta: "2026-08-11T16:15:00.000Z",
        gamma: "2026-08-11T16:30:00.000Z"
      }],
      limit: 2
    }).map((artist) => artist.id)).toEqual(["beta", "gamma"]);
  });
});
