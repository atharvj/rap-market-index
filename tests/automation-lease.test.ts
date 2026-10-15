import { describe, expect, it, vi } from "vitest";
import { claimAutomationWindow } from "@/server/market/automation-lease";
describe("shared automation window", () => {
  it("uses a stable server-side key and the existing atomic database limiter", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: true }], error: null });
    expect(await claimAutomationWindow({ rpc } as never)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_api_rate_limit", { p_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/), p_scope: "market-automation", p_limit: 1, p_window_seconds: 900 });
    rpc.mockResolvedValue({ data: [{ allowed: false }], error: null });
    expect(await claimAutomationWindow({ rpc } as never)).toBe(false);
  });
  it.each([{ data: null, error: { message: "unavailable" } }, { data: [], error: null }, { data: [{ allowed: "true" }], error: null }])("fails closed when the distributed lock is unavailable", async result => {
    await expect(claimAutomationWindow({ rpc: async () => result } as never)).rejects.toThrow("distributed");
  });
});
