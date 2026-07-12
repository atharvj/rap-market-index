import { describe, expect, it } from "vitest";
import {
  groupNewsStoryEvents,
  getNewsStoryKey,
  resolveNewsStoryArtists
} from "@/server/market/news-story-groups";

const baseEvent = {
  event_date: "2026-07-12",
  title: "Che and Nine Vicious perform together",
  source_url: "https://example.com/story?utm_source=feed"
};

describe("news story groups", () => {
  it("groups independently attributed artists that share a source story", () => {
    const groups = groupNewsStoryEvents([
      { ...baseEvent, id: "one", artist_id: "che" },
      {
        ...baseEvent,
        id: "two",
        artist_id: "nine-vicious",
        source_url: "https://EXAMPLE.com/story?utm_medium=rss"
      }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((event) => event.artist_id)).toEqual(["che", "nine-vicious"]);
  });

  it("keeps unrelated sources separate even when their headlines match", () => {
    const groups = groupNewsStoryEvents([
      { ...baseEvent, id: "one", artist_id: "che" },
      { ...baseEvent, id: "two", artist_id: "nine-vicious", source_url: "https://other.test/story" }
    ]);

    expect(groups).toHaveLength(2);
  });

  it("uses a requested artist as the primary row without dropping co-credited artists", () => {
    const groups = groupNewsStoryEvents(
      [
        { ...baseEvent, id: "one", artist_id: "che" },
        { ...baseEvent, id: "two", artist_id: "nine-vicious" }
      ],
      new Set(["nine-vicious"])
    );

    expect(groups[0].primary.artist_id).toBe("nine-vicious");
    expect(groups[0].events).toHaveLength(2);
  });

  it("falls back to date and normalized headline when no source URL exists", () => {
    const first = { ...baseEvent, id: "one", artist_id: "che", source_url: null };
    const second = {
      ...baseEvent,
      id: "two",
      artist_id: "nine-vicious",
      source_url: null,
      title: "Che and Nine Vicious perform together - Example News"
    };

    expect(getNewsStoryKey(first)).toBe(getNewsStoryKey(second));
  });

  it("includes exact structured related-artist attributions without scanning arbitrary headline words", () => {
    const primary = {
      ...baseEvent,
      id: "one",
      artist_id: "che",
      raw_payload: {
        relatedArtistNames: ["Nine Vicious"],
        relatedArtistTickers: ["UNKNOWN"]
      }
    };
    const artists = [
      { id: "che", name: "Che", ticker: "CHE" },
      { id: "nine-vicious", name: "Nine Vicious", ticker: "NINEV" },
      { id: "future", name: "Future", ticker: "FUTR" }
    ];

    expect(resolveNewsStoryArtists({ primary, events: [primary], artists }).map((artist) => artist.ticker)).toEqual([
      "CHE",
      "NINEV"
    ]);
  });
});
