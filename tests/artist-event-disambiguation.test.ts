import { describe, expect, it } from "vitest";
import {
  hasArtistFeatureCreditContext,
  hasArtistReleaseSubjectContext
} from "@/server/market/artist-event-disambiguation";

describe("artist event ownership", () => {
  it.each([
    ["Kendrick Lamar", "The Game"],
    ["Future", "Metro Boomin"],
    ["Nettspend", "OsamaSon"]
  ])("does not treat another artist's album as %s's release", (artistName, subjectName) => {
    const headline = `${subjectName} Responds to Allegations About Beef With ${artistName} on New Album`;

    expect(hasArtistReleaseSubjectContext({ artistName, text: headline })).toBe(false);
  });

  it("does not treat conflict language as a feature credit", () => {
    const headline = "The Game Sets the Record Straight on Beef With Kendrick Lamar on New Album";

    expect(hasArtistFeatureCreditContext({ artistName: "Kendrick Lamar", text: headline })).toBe(false);
  });

  it.each(["Kendrick Lamar", "Future", "Nettspend"])(
    "still accepts direct release ownership and explicit features for %s",
    (artistName) => {
      expect(
        hasArtistReleaseSubjectContext({ artistName, text: `${artistName} releases new album` })
      ).toBe(true);
      expect(
        hasArtistFeatureCreditContext({ artistName, text: `New single featuring ${artistName}` })
      ).toBe(true);
    }
  );
});
