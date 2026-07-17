import { expect, test } from "@playwright/test";

test("private APIs reject anonymous callers", async ({ request }) => {
  const checks = [
    request.get("/api/watchlist"),
    request.post("/api/profile/bootstrap", { data: {} }),
    request.post("/api/trades", {
      data: { artistId: "drake", type: "buy", shares: 1 }
    })
  ];
  const responses = await Promise.all(checks);

  for (const response of responses) {
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  }
});

test("admin APIs reject anonymous callers", async ({ request }) => {
  const response = await request.get("/api/admin/market-health");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ ok: false });
});

test("cross-site browser mutations are rejected before route handling", async ({ request }) => {
  const response = await request.post("/api/trades", {
    headers: {
      origin: "https://attacker.invalid",
      "sec-fetch-site": "cross-site"
    },
    data: { artistId: "drake", type: "buy", shares: 1 }
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "Cross-site requests are not allowed."
  });
});
