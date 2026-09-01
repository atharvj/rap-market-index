import { describe, expect, it, vi } from "vitest";
import { liquidateUnderMarginedShorts } from "@/server/short-risk";

describe("short maintenance margin", () => {
  it("covers every position at or below the maintenance threshold without market impact", async () => {
    const positions = [
      { user_id: "user-1", artist_id: "young-thug", shares: 12, equity_percent: 29.9 },
      { user_id: "user-2", artist_id: "nav", shares: 5, equity_percent: 12 }
    ];
    const query = createQuery(positions);
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    const supabase = {
      from: vi.fn(() => query),
      rpc
    };

    const result = await liquidateUnderMarginedShorts(supabase as never);

    expect(query.lte).toHaveBeenCalledWith("equity_percent", 30);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("execute_artist_trade_as_user", {
      p_user_id: "user-1",
      p_side: "cover",
      p_artist_id: "young-thug",
      p_shares: 12,
      p_market_eligible: false
    });
    expect(result).toEqual({ inspected: 2, liquidated: 2, failures: 0 });
  });

  it("reports failed forced covers for operational review", async () => {
    const query = createQuery([{ user_id: "user-1", artist_id: "young-thug", shares: 2, equity_percent: 20 }]);
    const supabase = {
      from: vi.fn(() => query),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "cover failed" } })
    };

    await expect(liquidateUnderMarginedShorts(supabase as never)).resolves.toEqual({
      inspected: 1,
      liquidated: 0,
      failures: 1
    });
  });
});

function createQuery(rows: Array<Record<string, unknown>>) {
  const query = {
    select: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    eq: vi.fn(),
    then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null }))
  };

  query.select.mockReturnValue(query);
  query.lte.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
