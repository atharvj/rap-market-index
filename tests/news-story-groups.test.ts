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

  it("groups syndicated copies with the same normalized headline", () => {
    const groups = groupNewsStoryEvents([
      { ...baseEvent, id: "one", artist_id: "che" },
      { ...baseEvent, id: "two", artist_id: "nine-vicious", source_url: "https://other.test/story" }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((event) => event.artist_id)).toEqual(["che", "nine-vicious"]);
  });

  it("keeps the same syndicated headline separate across different dates", () => {
    const groups = groupNewsStoryEvents([
      { ...baseEvent, id: "one", artist_id: "che" },
      { ...baseEvent, id: "two", artist_id: "che", event_date: "2026-07-13", source_url: "https://other.test/story" }
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

  it("strips publisher suffixes from syndicated headline keys", () => {
    const first = {
      ...baseEvent,
      id: "one",
      artist_id: "tezzus",
      title: "Tezzus Previews Alleged Oogie Mane Diss Track Amid ilykimchi Leaks - HotNewHipHop",
      source_url: "https://www.hotnewhiphop.com/927360-tezzus-previews-alleged-oogie-mane-diss-track-amid-ilykimchi-leaks"
    };
    const second = {
      ...baseEvent,
      id: "two",
      artist_id: "tezzus",
      title: "Tezzus Previews Alleged Oogie Mane Diss Track Amid ilykimchi Leaks",
      source_url: "https://www.hotnewhiphop.com/927360-tezzus-previews-alleged-oogie-mane-diss-track-amid-ilykimchi-leaks-hip-hop-news"
    };

    expect(getNewsStoryKey(first)).toBe(getNewsStoryKey(second));
    expect(groupNewsStoryEvents([first, second])).toHaveLength(1);
  });

  it("groups local-radio copies of the same Jay-Z concert story", () => {
    const first = {
      ...baseEvent,
      id: "one",
      artist_id: "jay-z",
      title: "Every Surprise Guest At JAY-Z's \"Extra Innings\" Show At Yankee Stadium - WGCI-FM",
      source_url: "https://wgci.iheart.com/content/jay-z-extra-innings-guests"
    };
    const second = {
      ...baseEvent,
      id: "two",
      artist_id: "jay-z",
      title: "Every Surprise Guest At JAY-Z's \"Extra Innings\" Show At Yankee Stadium - Real 92.3",
      source_url: "https://real923la.iheart.com/content/jay-z-extra-innings-guests"
    };

    expect(getNewsStoryKey(first)).toBe(getNewsStoryKey(second));
    expect(groupNewsStoryEvents([first, second])).toHaveLength(1);
  });

  it("includes exact structured related-artist attributions", () => {
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

  it("recovers unambiguous co-artists named explicitly in a headline", () => {
    const primary = {
      ...baseEvent,
      id: "latto-story",
      artist_id: "latto",
      title: "Doja Cat & Latto Team Up for 'Okayyy' Video and Ma Vie World Tour"
    };
    const artists = [
      { id: "latto", name: "Latto", ticker: "LATTO" },
      { id: "doja-cat", name: "Doja Cat", ticker: "DOJA" },
      { id: "future", name: "Future", ticker: "FUTR" }
    ];

    expect(resolveNewsStoryArtists({ primary, events: [primary], artists }).map((artist) => artist.ticker)).toEqual([
      "LATTO",
      "DOJA"
    ]);
  });

  it("does not infer short or common-word artist names from arbitrary headline language", () => {
    const primary = {
      ...baseEvent,
      id: "latto-story",
      artist_id: "latto",
      title: "Latto discusses the future with Ian after her tour"
    };
    const artists = [
      { id: "latto", name: "Latto", ticker: "LATTO" },
      { id: "future", name: "Future", ticker: "FUTR" },
      { id: "ian", name: "ian", ticker: "IAN" }
    ];

    expect(resolveNewsStoryArtists({ primary, events: [primary], artists }).map((artist) => artist.ticker)).toEqual([
      "LATTO"
    ]);
  });
});
