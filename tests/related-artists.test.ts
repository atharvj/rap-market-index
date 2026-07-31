import { describe, expect, it } from "vitest";
import { createInitialArtists } from "../src/data/mockArtists";
import { getRelatedArtists } from "../src/lib/related-artists";

describe("getRelatedArtists", () => {
  const artists = createInitialArtists();

  it("returns a deterministic set without the current artist", () => {
    const current = artists.find((artist) => artist.id === "drake")!;
    const related = getRelatedArtists(current, artists, 4);

    expect(related).toHaveLength(4);
    expect(related.map((artist) => artist.id)).not.toContain(current.id);
    expect(getRelatedArtists(current, artists, 4).map((artist) => artist.id)).toEqual(
      related.map((artist) => artist.id)
    );
  });

  it("prefers a nearby market tier over a distant profile", () => {
    const current = artists.find((artist) => artist.id === "drake")!;
    const nearby = artists.find((artist) => artist.id === "kendrick-lamar")!;
    const distant = artists.find((artist) => artist.id === "feng")!;
    const related = getRelatedArtists(current, [current, distant, nearby], 2);

    expect(related.map((artist) => artist.id)).toEqual([nearby.id, distant.id]);
  });

  it("honors empty and bounded limits", () => {
    const current = artists[0];

    expect(getRelatedArtists(current, artists, 0)).toEqual([]);
    expect(getRelatedArtists(current, [current], 4)).toEqual([]);
  });
});
