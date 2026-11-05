import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export function assertMarketSnapshot(data) {
  assert.equal(data?.ok, true, "Market snapshot failed");
  assert.equal(data.source, "supabase", "Market returned demo data");
  const artists = data.state?.artists;
  assert.ok(Array.isArray(artists) && artists.length > 0, "No active quotes");
  assert.equal(new Set(artists.map(a => a.id)).size, artists.length, "Duplicate artist IDs");
  for (const a of artists) {
    assert.ok(typeof a.id === "string" && Number.isFinite(a.currentPrice) && a.currentPrice > 0, "Invalid quote");
    assert.ok(Number.isFinite(a.previousClose) && a.previousClose > 0 && Number.isFinite(a.dailyChangePercent), "Invalid previous close or return");
    assert.ok(Math.abs((a.currentPrice / a.previousClose - 1) * 100 - a.dailyChangePercent) <= 0.000050001, "Daily return does not match quote");
  }
  const freshness = data.state.quoteFreshness;
  assert.ok(freshness && freshness.artistCount === artists.length, "Quote freshness coverage is unavailable");
  assert.ok(Number.isFinite(Date.parse(freshness.checkedAt)), "Invalid freshness date");
  assert.ok(Number.isInteger(freshness.staleArtistCount) && freshness.staleArtistCount >= 0 && freshness.staleArtistCount <= artists.length, "Invalid freshness coverage");
  return artists;
}

export function assertArtistHistory(history, artist, marketDate) {
  assert.equal(history?.ok, true, "History request failed");
  assert.equal(history.source, "supabase", "History returned demo data");
  assert.equal(history.range, "1M", "Default chart range changed");
  assert.ok(Array.isArray(history.points) && history.points.length > 0, "No history");
  for (let i = 0; i < history.points.length; i++) {
    const p = history.points[i];
    assert.ok(Number.isFinite(p.price) && p.price > 0, "Invalid history price");
    if (i) assert.ok(p.date > history.points[i - 1].date, "History dates are duplicated or out of order");
  }
  assert.equal(history.points.at(-1).date, marketDate, "Today’s close is missing");
  assert.equal(history.points.at(-1).price, artist.currentPrice, "Chart and quote disagree");
}

async function checkMarketReadiness() {
  const origin = "https://rap-market-index.vercel.app";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const get = async path => {
        const response = await fetch(origin + path + (path.includes("?") ? "&" : "?") + "readiness=" + Date.now(), { signal: AbortSignal.timeout(45000), headers: { DNT: "1" } });
        assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
        return response.json();
      };
      let snapshot;
      let artists;
      // A public read requests the existing guarded recovery when data is stale.
      // Give that asynchronous work time to finish, then fail if it stays stale.
      for (let poll = 0; poll <= 8; poll++) {
        snapshot = await get("/api/market/snapshot");
        artists = assertMarketSnapshot(snapshot);
        if (snapshot.state.quoteFreshness.staleArtistCount === 0) break;
        assert.ok(poll < 8, "Quotes remain stale after the recovery grace period");
        console.log(JSON.stringify({ waitingForFreshQuotes: snapshot.state.quoteFreshness.staleArtistCount }));
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
      let cursor = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (cursor < artists.length) {
          const artist = artists[cursor++];
          assertArtistHistory(await get("/api/market/history/" + encodeURIComponent(artist.id)), artist, snapshot.state.lastUpdatedAt);
        }
      }));
      const after = await get("/api/market/snapshot");
      const afterArtists = assertMarketSnapshot(after);
      assert.deepEqual(artists.map(a => [a.id, a.currentPrice]), afterArtists.map(a => [a.id, a.currentPrice]), "Quotes changed during verification; retry");
      const status = await get("/api/market/status");
      assert.equal(status.ok, true, "Trading status is unavailable");
      assert.equal(status.source, "supabase");
      console.log(JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), artistCount: artists.length,
        historyCount: artists.length, marketDate: snapshot.state.lastUpdatedAt, tradingOpen: status.status.isOpen,
        staleArtistCount: snapshot.state.quoteFreshness.staleArtistCount }));
      return;
    } catch (error) {
      if (attempt) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkMarketReadiness().catch(error => { console.error(error.message); process.exitCode = 1; });
}
