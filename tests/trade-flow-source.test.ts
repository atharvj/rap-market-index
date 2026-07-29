import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { collectTradeFlowMarketSignals } from "@/server/market/trade-flow-source";

const artist: MarketUpdateArtist = {
  id: "artist",
  name: "Artist",
  ticker: "ART",
  currentPrice: 20,
  previousClose: 20,
  hypeScore: 50,
  volatility: 1,
  category: "rising",
  stats: {
    streamingGrowth: 0,
    youtubeGrowth: 0,
    searchGrowth: 0,
    socialGrowth: 0,
    newsScore: 50,
    traderDemand: 0
  }
};

describe("trade-flow market source", () => {
  it("defensively excludes admin and market-exempt accounts even if their trades are marked eligible", async () => {
    const supabase = createSupabaseMock({
      trades: [
        trade("admin", "buy", 9_000),
        trade("exempt", "buy", 7_000),
        trade("user-1", "sell", 1_000),
        trade("user-2", "sell", 1_000),
        trade("user-3", "sell", 1_000)
      ],
      excludedProfiles: [
        { id: "admin", is_admin: true, market_impact_exempt: true },
        { id: "exempt", is_admin: false, market_impact_exempt: true }
      ]
    });

    const result = await collectTradeFlowMarketSignals({
      supabase,
      artists: [artist],
      runDate: "2026-07-29"
    });
    const payload = result.signals.artist.rawPayload;

    expect(payload.buyValue).toBe(0);
    expect(payload.sellValue).toBe(3_000);
    expect(payload.tradeCount).toBe(3);
    expect(payload.uniqueTraderCount).toBe(3);
    expect(result.signals.artist.stats.traderDemand).toBeLessThan(0);
    expect(result.warnings).toContain(
      "Defensively excluded 2 admin or market-exempt trades that had been marked market-eligible."
    );
  });

  it("fails closed when excluded-account status cannot be verified", async () => {
    const supabase = createSupabaseMock({
      trades: [trade("user-1", "buy", 1_000)],
      excludedProfilesError: "profile lookup failed"
    });

    await expect(
      collectTradeFlowMarketSignals({
        supabase,
        artists: [artist],
        runDate: "2026-07-29"
      })
    ).rejects.toThrow("Could not verify excluded trade accounts: profile lookup failed");
  });
});

function trade(userId: string, type: "buy" | "sell", grossValue: number) {
  return {
    artist_id: "artist",
    user_id: userId,
    type,
    shares: grossValue / 20,
    price: 20,
    cash_delta: type === "buy" ? -grossValue : grossValue,
    gross_value: grossValue,
    market_eligible: true,
    created_at: "2026-07-29T12:00:00.000Z"
  };
}

function createSupabaseMock({
  trades,
  excludedProfiles = [],
  excludedProfilesError
}: {
  trades: ReturnType<typeof trade>[];
  excludedProfiles?: Array<{ id: string; is_admin: boolean; market_impact_exempt: boolean }>;
  excludedProfilesError?: string;
}) {
  const client = {
    from(table: string) {
      if (table === "market_trade_events") {
        const builder = {
          select: () => builder,
          in: () => builder,
          eq: () => builder,
          gte: () => builder,
          lt: () => builder,
          order: () => builder,
          limit: async () => ({ data: trades, error: null })
        };

        return builder;
      }

      if (table === "profiles") {
        const builder = {
          select: () => builder,
          or: async () => ({
            data: excludedProfiles,
            error: excludedProfilesError ? { message: excludedProfilesError } : null
          })
        };

        return builder;
      }

      throw new Error(`Unexpected table: ${table}`);
    }
  };

  return client as unknown as SupabaseClient<Database>;
}
