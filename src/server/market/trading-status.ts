export type TradingStatusRow = {
  trading_mode: string;
  market_open: boolean;
  market_impact_enabled: boolean;
  artist_halted: boolean;
  reason: string;
};

// RPC responses are external data. Missing controls must never imply open trading.
export function parseTradingStatus(data: unknown): TradingStatusRow | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const row = data[0];
  if (!row || typeof row !== "object" ||
    typeof row.trading_mode !== "string" || !row.trading_mode.trim() ||
    typeof row.market_open !== "boolean" ||
    typeof row.market_impact_enabled !== "boolean" ||
    typeof row.artist_halted !== "boolean" || typeof row.reason !== "string") return null;
  return row as TradingStatusRow;
}
