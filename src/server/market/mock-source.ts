import { createInitialArtists } from "@/data/mockArtists";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

export function getMockMarketArtists(): MarketUpdateArtist[] {
  return createInitialArtists().map((artist) => ({
    id: artist.id,
    name: artist.name,
    ticker: artist.ticker,
    currentPrice: artist.currentPrice,
    previousClose: artist.previousClose,
    hypeScore: artist.hypeScore,
    volatility: artist.volatility,
    category: artist.category,
    stats: artist.stats
  }));
}
