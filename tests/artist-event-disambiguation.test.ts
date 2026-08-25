import { describe, expect, it } from "vitest";
import {
  hasArtistFeatureCreditContext,
  hasArtistReleaseSubjectContext
} from "@/server/market/artist-event-disambiguation";

describe("artist event ownership", () => {
  it("does not treat another artist's album as Kendrick Lamar's release", () => {
    const headline =
      "The Game Responds to Allegations That He Takes Shots at Kendrick Lamar on New Album";

    expect(hasArtistReleaseSubjectContext({ artistName: "Kendrick Lamar", text: headline })).toBe(false);
  });

  it("does not treat conflict language as a feature credit", () => {
    const headline = "The Game Sets the Record Straight on Beef With Kendrick Lamar on New Album";

    expect(hasArtistFeatureCreditContext({ artistName: "Kendrick Lamar", text: headline })).toBe(false);
  });

  it("still accepts direct release ownership and explicit features", () => {
    expect(
      hasArtistReleaseSubjectContext({ artistName: "Kendrick Lamar", text: "Kendrick Lamar releases new album" })
    ).toBe(true);
    expect(
      hasArtistFeatureCreditContext({ artistName: "Kendrick Lamar", text: "New single featuring Kendrick Lamar" })
    ).toBe(true);
  });
});
