import { describe, expect, it } from "vitest";
import { automationFailureStatus, readAutomationResponse } from "@/server/market/automation-response";

describe("automation completion responses", () => {
  it.each([null, [], {}, { ok: "true" }, { ok: 1 }, "success"])("rejects malformed success payload %j", async payload => {
    expect((await readAutomationResponse(Response.json(payload))).ok).toBe(false);
  });
  it("rejects empty and non-JSON responses", async () => {
    expect((await readAutomationResponse(new Response(""))).ok).toBe(false);
    expect((await readAutomationResponse(new Response("<html>Error</html>"))).ok).toBe(false);
  });
  it("preserves explicit completion and failure details", async () => {
    expect(await readAutomationResponse(Response.json({ ok: true, persisted: true }))).toEqual({ ok: true, persisted: true });
    expect(await readAutomationResponse(Response.json({ ok: false, error: "Write failed" }))).toEqual({ ok: false, error: "Write failed" });
  });
  it.each([200, 201, 204, 302])("converts unsuccessful application responses with HTTP %i to 502", status => {
    expect(automationFailureStatus(new Response(null, { status }))).toBe(502);
  });
  it.each([401, 429, 500, 503])("preserves upstream error status %i", status => {
    expect(automationFailureStatus(new Response(null, { status }))).toBe(status);
  });
});
