import type { Database } from "@/lib/supabase/database.types";
import type { Transaction } from "@/lib/types";

export type MarketTradeEventRow = Database["public"]["Views"]["market_trade_events"]["Row"];

export function mapMarketTradeEvent(transaction: MarketTradeEventRow): Transaction {
  return {
    id: transaction.id,
    artistId: transaction.artist_id,
    type: transaction.type,
    shares: Number(transaction.shares),
    price: Number(transaction.price),
    grossValue: Number(transaction.gross_value ?? Math.abs(transaction.cash_delta)),
    commission: Number(transaction.commission ?? 0),
    marketEligible: Boolean(transaction.market_eligible ?? true),
    createdAt: transaction.created_at
  };
}
