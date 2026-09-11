import { describe, expect, it } from "vitest";
import { createInitialArtists } from "@/data/mockArtists";
import { formatArtistDisplayName, getArtistTickerOverride } from "@/lib/artist-display-name";
import { getStarterCategory, getStarterVolatility } from "@/lib/starter-valuation";

const VERIFIED_LISTINGS = [
  { id: "polo-g", price: 85.58, subscribers: 6_510_000, views: 4_557_756_498 },
  { id: "lil-tjay", price: 84.95, subscribers: 6_540_000, views: 3_576_091_438 },
  { id: "moneybagg-yo", price: 83.13, subscribers: 4_000_000, views: 4_987_941_723 },
  { id: "young-nudy", price: 70.09, subscribers: 866_000, views: 915_736_967 },
  { id: "dc-the-don", price: 57.12, subscribers: 266_000, views: 84_738_500 },
  { id: "anycia", price: 51.05, subscribers: 114_000, views: 50_852_406 },
  { id: "trap-dickey", price: 55.7, subscribers: 171_000, views: 123_836_354 },
  { id: "42-dugg", price: 71.17, subscribers: 984_000, views: 1_051_481_193 },
  { id: "babyface-ray", price: 65.34, subscribers: 453_000, views: 595_914_048 },
  { id: "loe-shimmy", price: 61.89, subscribers: 300_000, views: 386_147_802 }
] as const;

describe("verified relevance roster", () => {
  it("preserves recorded historical openings across valuation model changes", () => {
    const artists = new Map(createInitialArtists().map((artist) => [artist.id, artist]));

    for (const listing of VERIFIED_LISTINGS) {
      const price = listing.price;
      const artist = artists.get(listing.id);

      expect(artist).toBeDefined();
      expect(artist?.currentPrice).toBe(price);
      expect(artist?.previousClose).toBe(price);
      expect(artist?.category).toBe(getStarterCategory(price));
      expect(artist?.volatility).toBe(getStarterVolatility(getStarterCategory(price)));
    }
  });

  it("starts every new listing with neutral signals and one honest opening point", () => {
    const artists = new Map(createInitialArtists().map((artist) => [artist.id, artist]));

    for (const listing of VERIFIED_LISTINGS) {
      const artist = artists.get(listing.id);

      expect(artist?.hypeScore).toBe(50);
      expect(artist?.stats).toEqual({
        streamingGrowth: 0,
        youtubeGrowth: 0,
        searchGrowth: 0,
        socialGrowth: 0,
        newsScore: 50,
        traderDemand: 0
      });
      expect(artist?.priceHistory).toEqual([{ date: "2026-08-26", price: listing.price }]);
    }
  });

  it("keeps verified display names and deliberate market tickers", () => {
    expect(formatArtistDisplayName("dc the don")).toBe("DC The Don");
    expect(getArtistTickerOverride("Moneybagg Yo")).toBe("BAGG");
    expect(getArtistTickerOverride("DC The Don")).toBe("DCTD");
    expect(getArtistTickerOverride("Trap Dickey")).toBe("TRAPD");
    expect(getArtistTickerOverride("Babyface Ray")).toBe("BFRAY");
  });
});
