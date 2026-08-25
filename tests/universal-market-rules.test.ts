import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SHARED_RULE_FILES = [
  "src/server/market/audience-scale.ts",
  "src/server/market/daily-update.ts",
  "src/server/market/intraday-refresh.ts",
  "src/server/market/market-wide-calibration.ts",
  "src/server/market/source-quality.ts",
  "src/server/market/artist-event-disambiguation.ts",
  "src/server/market/event-signals.ts",
  "src/server/market/watch-now-videos.ts",
  "src/server/market/youtube-comments-source.ts"
];

const ARTIST_IDENTITY_BRANCHES = [
  /\b(?:artist|update|performer)\.(?:id|name|ticker)\s*(?:===|!==)\s*["'`]/,
  /["'`][^"'`]+["'`]\s*(?:===|!==)\s*\b(?:artist|update|performer)\.(?:id|name|ticker)/,
  /\b(?:artistId|artistName|ticker)\s*(?:===|!==)\s*["'`]/,
  /["'`][^"'`]+["'`]\s*(?:===|!==)\s*\b(?:artistId|artistName|ticker)/,
  /\bswitch\s*\(\s*(?:artist|update|performer)\.(?:id|name|ticker)\s*\)/
];

describe("universal market-rule policy", () => {
  it.each(SHARED_RULE_FILES)("does not branch shared behavior on a named artist in %s", (file) => {
    const source = readFileSync(file, "utf8");

    for (const pattern of ARTIST_IDENTITY_BRANCHES) {
      expect(source, `${file} contains artist-specific behavior matching ${pattern}`).not.toMatch(pattern);
    }
  });
});
