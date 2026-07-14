import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { secureCompare } from "@/server/secrets";

describe("secureCompare", () => {
  it("accepts identical secrets", () => {
    expect(secureCompare("a-long-secret", "a-long-secret")).toBe(true);
  });

  it("rejects different secrets regardless of length", () => {
    expect(secureCompare("short", "a-long-secret")).toBe(false);
    expect(secureCompare("a-long-secret-x", "a-long-secret")).toBe(false);
  });

  it("rejects absent secrets", () => {
    expect(secureCompare(null, "a-long-secret")).toBe(false);
    expect(secureCompare("a-long-secret", undefined)).toBe(false);
  });
});

describe("API security middleware", () => {
  it("rejects cross-site mutations", () => {
    const request = makeRequest("https://rap-market-index.vercel.app/api/trades", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site"
      }
    });

    expect(middleware(request).status).toBe(403);
  });

  it("rejects a mismatched browser origin", () => {
    const request = makeRequest("https://rap-market-index.vercel.app/api/watchlist", {
      method: "DELETE",
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "same-site"
      }
    });

    expect(middleware(request).status).toBe(403);
  });

  it("allows a same-origin mutation", () => {
    const request = makeRequest("https://rap-market-index.vercel.app/api/watchlist", {
      method: "POST",
      headers: {
        origin: "https://rap-market-index.vercel.app",
        "sec-fetch-site": "same-origin"
      }
    });

    expect(middleware(request).status).toBe(200);
  });

  it("rejects oversized request bodies before route parsing", () => {
    const request = makeRequest("https://rap-market-index.vercel.app/api/trades", {
      method: "POST",
      headers: {
        "content-length": String(513 * 1024),
        origin: "https://rap-market-index.vercel.app",
        "sec-fetch-site": "same-origin"
      }
    });

    expect(middleware(request).status).toBe(413);
  });
});

function makeRequest(url: string, init: RequestInit) {
  return new NextRequest(new Request(url, init));
}
