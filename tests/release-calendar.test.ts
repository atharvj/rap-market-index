import { describe, expect, it } from "vitest";
import { readAnnouncedReleaseDate } from "@/lib/release-calendar";
const raw = {
  source: "media_rss_item",
  publisherArticleVerified: true,
  publisherHeadlineVerified: true,
  releaseKind: "album",
  releaseDate: "2026-11-14",
  publisherPublishedDate: "2026-11-07T12:00:00Z",
  publisherHeadline: "Artist's new album drops November 14.",
  publisherDescription: "",
};
describe("verified upcoming project dates", () => {
  it.each([
    "Artist's new album drops November 14.",
    "The EP will arrive Nov. 14, 2026.",
    "Artist announces album 'X', out November 14.",
    "Artist will release his mixtape on November 14.",
  ])("accepts an explicit publisher-confirmed release: %s", (headline) => {
    expect(
      readAnnouncedReleaseDate({ ...raw, publisherHeadline: headline }),
    ).toBe("2026-11-14");
  });
  it.each([
    "The festival is scheduled November 14; an album was also announced.",
    "Artist's album announcement includes a festival scheduled November 14.",
    "Artist turns 25 on November 14 with a new album coming soon.",
    "Artist announces an album. The tour is set for November 14.",
    "The new album drops November 15.",
    "The new album drops November 14, 2025.",
    "Artist's rumored new album drops November 14.",
    "The new album was delayed from November 14.",
  ])("rejects unrelated, incorrect or unconfirmed dates: %s", (headline) => {
    expect(
      readAnnouncedReleaseDate({ ...raw, publisherHeadline: headline }),
    ).toBeNull();
  });
  it("requires verified publisher evidence, a project kind and a valid upcoming calendar date", () => {
    for (const patch of [
      { source: "youtube" },
      { publisherArticleVerified: false },
      { publisherHeadlineVerified: false },
      { releaseKind: "single" },
      { releaseDate: "2026-02-31" },
      { releaseDate: "2026-11-01" },
      { releaseDate: "2027-11-14" },
      { publisherPublishedDate: "bad" },
    ]) {
      expect(readAnnouncedReleaseDate({ ...raw, ...patch })).toBeNull();
    }
  });
  it("does not attach a release verb in the headline to an unrelated date in the description", () => {
    expect(
      readAnnouncedReleaseDate({
        ...raw,
        publisherHeadline: "New album scheduled",
        publisherDescription: "November 14 is the artist's birthday.",
      }),
    ).toBeNull();
  });
});
