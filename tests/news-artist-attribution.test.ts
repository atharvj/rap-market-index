import { describe, expect, it } from "vitest";
import profiles from "@/data/artistTrackingProfiles.json";
import { mentionsArtist } from "@/server/market/gdelt-source";
import { hasRequiredArtistEventDisambiguation, hasArtistFeatureCreditContext, hasArtistReleaseSubjectContext, hasArtistStatusSubjectContext } from "@/server/market/artist-event-disambiguation";
import { hasNewsArtistAttribution } from "@/server/market/news-artist-attribution";
import { resolveNewsStoryArtists } from "@/server/market/news-story-groups";
import { buildEventMarketSignals } from "@/server/market/event-signals";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { MarketEvent } from "@/server/market/market-data";

const title = "Cardi B Makes a Splash on ‘GTA VI: The Album’ Soundtrack With Cocky ‘Don’t Chart’: Listen";
const raw = { source: "media_rss_item", searchQuery: '"Cardi B" (album OR song)', sourceTier: 3,
  textMatchedArtist: true, disambiguatedArtist: true, publisherArticleVerified: true,
  publisherHeadlineVerified: true, publisherHeadline: title, relatedArtistIds: ["dc-the-don"] };

describe("news artist attribution", () => {
  it("rejects another person's complete name even behind a legacy synthesized artist prefix", () => {
    const headline = "Lizzy McAlpine Got Stella Lefty’d Over Nick Drake Soundalike On Her New Album";
    expect(mentionsArtist(headline, "Drake")).toBe(false);
    expect(hasNewsArtistAttribution({ artistName: "Drake", title: "Drake - Plagiarism in music is always a hot topic",
      rawPayload: { publisherArticleVerified: true, publisherHeadlineVerified: true, publisherHeadline: headline,
        textMatchedArtist: true, publisherDescription: "Lizzy McAlpine credited Nick Drake on her new song." } })).toBe(false);
    expect(hasNewsArtistAttribution({ artistName: "Drake", title: "Drake discusses Nick Drake's influence on his new song", rawPayload: {} })).toBe(true);
    for (const headline of ["Drake Bell releases a new song", "Drake Maye attends a concert"]) {
      expect(mentionsArtist(headline, "Drake")).toBe(false);
    }
  });
  it("rejects DC The Don on the Cardi B story despite the search query and claimed match flags", () => {
    expect(mentionsArtist(title, "DC The Don", raw.searchQuery)).toBe(false);
    expect(hasRequiredArtistEventDisambiguation({ artistName: "DC The Don", text: title, query: raw.searchQuery, sourceTier: 3 })).toBe(false);
    expect(hasNewsArtistAttribution({ artistName: "DC The Don", title, rawPayload: raw })).toBe(false);
    const primary = { id: "cardi", artist_id: "cardi-b", title, event_date: "2026-10-09", source_url: "https://billboard.com/cardi", raw_payload: raw };
    const artists = [{ id: "cardi-b", name: "Cardi B", ticker: "CARDI" }, { id: "dc-the-don", name: "DC The Don", ticker: "DCTD" }];
    expect(resolveNewsStoryArtists({ primary, events: [primary, { ...primary, id: "dc", artist_id: "dc-the-don" }], artists }).map(a => a.id)).toEqual(["cardi-b"]);
  });

  it("never substitutes any other roster artist from the search query", () => {
    const artists = Object.values(profiles);
    for (const subject of artists) {
      const headline = `${subject.name} releases a new album`;
      for (const candidate of artists.filter(a => a.name !== subject.name)) {
        expect(hasRequiredArtistEventDisambiguation({ artistName: candidate.name, text: headline,
          query: `"${subject.name}" "${candidate.name}"`, sourceTier: 3 }), `${candidate.name}: ${headline}`).toBe(false);
      }
    }
  });

  it("does not infer features, releases or legal status from another artist's query", () => {
    const artistName = "DC The Don", query = '"Cardi B"';
    expect(hasArtistFeatureCreditContext({ artistName, query, text: "New song featuring Cardi B" })).toBe(false);
    expect(hasArtistReleaseSubjectContext({ artistName, query, text: "Cardi B releases a new album" })).toBe(false);
    expect(hasArtistStatusSubjectContext({ artistName, query, text: "Cardi B arrested", statusSubtype: "legal_arrest" })).toBe(false);
  });

  it.each([
    ["DC The Don", "Don Toliver plans the whole chart campaign"],
    ["Lil Baby", "Lil Durk releases a song after welcoming a baby"],
    ["Lil Wayne", "LilWayneFan releases a song"],
    ["Future", "Jess Fuchs: Feral review – a future comedy star"],
    ["ian", "Tea With Judi Dench Featuring Sir Ian McKellen review"],
    ["Future", "Drake discusses plans for a future album and tour"],
    ["BabyChiefDoIt", "Cash Cobain Drops ‘BabyChiefDoIt’ Official Music Video"],
    ["Protect", "The Game removes a verse to protect the coast on his new album"]
  ])("rejects loose name parts and ambiguous mentions for %s", (artistName, headline) => {
    expect(hasNewsArtistAttribution({ artistName, title: headline, rawPayload: {} })).toBe(false);
    if (["DC The Don", "Lil Baby", "Lil Wayne"].includes(artistName)) expect(mentionsArtist(headline, artistName)).toBe(false);
  });

  it("retains verified aliases, compact names and genuine short-name music credits", () => {
    expect(mentionsArtist("Kanye West releases a new album", "Ye")).toBe(true);
    expect(mentionsArtist("LilUziVert releases a new album", "Lil Uzi Vert")).toBe(true);
    for (const headline of ["Future Ties Drake on the Albums Chart", "Drake, Future, Don Toliver Dominate This Week’s Rap Charts", "That’s It [ft. Future]"]) {
      expect(hasNewsArtistAttribution({ artistName: "Future", title: headline, rawPayload: {} })).toBe(true);
    }
    expect(hasNewsArtistAttribution({ artistName: "Yeat", title: "Yeat Appears to Diss Travis Scott on New Track", rawPayload: {} })).toBe(true);
    expect(hasNewsArtistAttribution({ artistName: "Future", title: 'New song featuring "Future"', rawPayload: {} })).toBe(true);
    expect(hasNewsArtistAttribution({ artistName: "Ye", title: "Ye Makes Surprise Appearance to Support Lil Durk at His Murder-for-Hire Trial", rawPayload: {} })).toBe(true);
    expect(hasNewsArtistAttribution({ artistName: "NAV", title: "Young Thug Announces The New Generation Tour With NAV and YSL Signees", rawPayload: {} })).toBe(true);
    expect(hasNewsArtistAttribution({ artistName: "Future", title: "NBA YoungBoy Explains His Future Beef & Claims Pluto Isn’t A Gangster", rawPayload: {} })).toBe(true);
  });

  it("requires publisher proof before using description-only artist evidence", () => {
    const description = { publisherDescription: "Cardi B teams up with DC The Don on a new song" };
    expect(hasNewsArtistAttribution({ artistName: "DC The Don", title, rawPayload: description })).toBe(false);
    expect(hasNewsArtistAttribution({ artistName: "DC The Don", title, rawPayload: { ...description, publisherArticleVerified: true } })).toBe(true);
  });

  it("uses verified descriptions from the same article while rejecting another publication's unrelated artist", () => {
    const artists = [{ id: "young-thug", name: "Young Thug", ticker: "THUG" }, { id: "tezzus", name: "Tezzus", ticker: "TEZZUS" },
      { id: "dc-the-don", name: "DC The Don", ticker: "DCTD" }];
    const primary = { id: "thug", artist_id: "young-thug", title: "Young Thug Announces YSL Tour", event_date: "2026-10-09",
      source_url: "https://pitchfork.com/story/tour/", raw_payload: {} };
    const sibling = { ...primary, id: "tezzus", artist_id: "tezzus", raw_payload: { publisherArticleVerified: true,
      publisherHeadlineVerified: true, publisherDescription: "The tour features Thugger alongside Tezzus." } };
    const unrelated = { ...sibling, id: "dc", artist_id: "dc-the-don", source_url: "https://other.test/tour",
      raw_payload: { ...sibling.raw_payload, publisherDescription: "DC The Don announces his own tour." } };
    expect(resolveNewsStoryArtists({ primary, events: [primary, sibling, unrelated], artists }).map(a => a.id)).toEqual(["young-thug", "tezzus"]);
  });

  it("keeps unrelated articles out of an artist's event signal", () => {
    const artist: MarketUpdateArtist = { id: "dc-the-don", name: "DC The Don", ticker: "DCTD", currentPrice: 50, previousClose: 50,
      hypeScore: 50, volatility: 1, category: "rising", stats: { streamingGrowth: 0, youtubeGrowth: 0, socialGrowth: 0, searchGrowth: 0, newsScore: 50, traderDemand: 0 } };
    const event: MarketEvent = { artistId: artist.id, eventDate: "2026-10-09", title, eventType: "viral", impactScore: 46,
      sentimentScore: 30, confidence: 0.9, sourceUrl: "https://billboard.com/cardi", rawPayload: raw };
    expect(buildEventMarketSignals({ artists: [artist], runDate: "2026-10-14", eventsByArtist: { [artist.id]: [event] } })).toEqual({});
  });
});
