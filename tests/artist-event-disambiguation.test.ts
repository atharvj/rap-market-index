import { describe, expect, it } from "vitest";
import {
  hasRequiredArtistEventDisambiguation,
  hasArtistFeatureCreditContext,
  hasArtistReleaseSubjectContext
} from "@/server/market/artist-event-disambiguation";

describe("artist event ownership", () => {
  it.each([
    ["Ye", "Ye Brings Out Big Sean, 2 Chainz & Twista During Homecoming Show In Chicago"],
    ["Ye", "Ye Surpasses One Million Fans on 2026 World Tour With Historic New Orleans Return"],
    ["Future", "Future Brings Out Guests During Atlanta Concert"]
  ])("recognizes %s as the performer in a concert headline", (artistName, text) => {
    expect(hasRequiredArtistEventDisambiguation({ artistName, text, sourceTier: 2 })).toBe(true);
  });

  it.each([
    "The future brings out new technology for concert venues",
    "Future ticket prices surpass expectations for the world tour",
    "Ye olde theatre welcomes a new concert season"
  ])("rejects common words used outside an artist performance: %s", text => {
    // A capitalized name is not enough; these have no performer subject.
    const artistName = text.startsWith("Ye") ? "Ye" : "Future";
    expect(hasRequiredArtistEventDisambiguation({ artistName, text, sourceTier: 2 })).toBe(false);
  });
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
