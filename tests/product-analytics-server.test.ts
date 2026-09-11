import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recordPublicProductEvent, recordServerProductEvent } from "@/server/product-analytics";
import { trackProductEvent, validateProductAnalyticsEvent } from "@/lib/product-analytics";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("analytics milestone integrity", () => {
  it("matches the migration dedupe identity even when the HMAC secret rotates", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert }) } as never;
    for (const secret of ["old-secret", "new-secret"]) {
      vi.stubEnv("MARKET_UPDATE_SECRET", secret);
      expect(await recordServerProductEvent({ supabase, event: { eventName: "signup_completed", userId: "user-id" } })).toBe(true);
    }
    const expected = createHash("sha256").update("signup_completed:user-id").digest("hex");
    for (const [row, options] of upsert.mock.calls) {
      expect(row.dedupe_key).toBe(expected);
      expect(options.ignoreDuplicates).toBe(true);
    }
  });

  it("links authenticated visits without overwriting the original event time or campaign", async () => {
    const update = vi.fn();
    const query = { upsert: vi.fn().mockResolvedValue({ error: null }), update, eq: vi.fn(), is: vi.fn().mockResolvedValue({ error: null }) };
    update.mockReturnValue(query); query.eq.mockReturnValue(query);
    const validation = validateProductAnalyticsEvent({ eventName: "session_start", visitorId: "visitor_12345678", sessionId: "session_12345678", path: "/", campaignSource: "reddit" });
    if (!validation.ok) throw new Error(validation.error);
    await recordPublicProductEvent({ supabase: { from: () => query } as never, event: validation.value, userId: "user-id" });
    expect(query.upsert.mock.calls[0][1]).toEqual({ onConflict: "dedupe_key", ignoreDuplicates: true });
    expect(update).toHaveBeenCalledWith({ user_id: "user-id" });
    expect(query.is).toHaveBeenCalledWith("user_id", null);
  });

  it("does not report a failed trade response when only analytics storage fails", async () => {
    const supabase = { from: () => ({ upsert: () => Promise.reject(new Error("offline")) }) } as never;
    await expect(recordServerProductEvent({ supabase, event: { eventName: "signup_completed", userId: "user-id" } })).resolves.toBe(false);
  });

  it("does not recreate expired historical milestones", async () => {
    const from = vi.fn();
    await recordServerProductEvent({ supabase: { from } as never, event: { eventName: "signup_completed", userId: "user-id", occurredAt: "2020-01-01T00:00:00Z" } });
    expect(from).not.toHaveBeenCalled();
  });

  it("leaves signup usable when the browser blocks access to local storage", () => {
    vi.stubGlobal("window", { navigator: { doNotTrack: "0" }, get localStorage() { throw new Error("Storage blocked"); } });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(() => trackProductEvent({ eventName: "signup_started", authMethod: "google", path: "/account" })).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
