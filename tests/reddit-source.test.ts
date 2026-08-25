import { describe, expect, it } from "vitest";
import { buildArtistRedditSubreddits } from "@/server/market/reddit-source";

describe("artist community coverage", () => {
  it("includes likely artist-specific communities alongside broad rap communities", () => {
    expect(
      buildArtistRedditSubreddits({ name: "Kendrick Lamar", ticker: "KDOT" }, ["hiphopheads", "rap"])
    ).toEqual(["hiphopheads", "rap", "KendrickLamar", "KDOT"]);

    expect(buildArtistRedditSubreddits({ name: "NAV", ticker: "$NAV" }, ["hiphopheads"]))
      .toEqual(["hiphopheads", "NAV"]);
  });
});
