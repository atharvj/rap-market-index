import { describe, expect, it } from "vitest";
import {
  isTrustedEmergingEditorialCoverage,
  promoteEmergingEditorialCoverage
} from "@/server/market/emerging-news";

describe("emerging artist editorial coverage", () => {
  it("accepts trusted publication coverage for rising and underground artists", () => {
    expect(isTrustedEmergingEditorialCoverage({
      category: "underground",
      source: "media_rss_item",
      sourceTier: 1
    })).toBe(true);
    expect(isTrustedEmergingEditorialCoverage({
      category: "rising",
      source: "ai_research_event",
      sourceTier: 2
    })).toBe(true);
  });

  it("does not treat uploads, unknown publications, or mainstream coverage as the reserved article", () => {
    expect(isTrustedEmergingEditorialCoverage({
      category: "underground",
      source: "youtube_upload_event",
      sourceTier: 3
    })).toBe(false);
    expect(isTrustedEmergingEditorialCoverage({
      category: "underground",
      source: "media_rss_item",
      sourceTier: 0
    })).toBe(false);
    expect(isTrustedEmergingEditorialCoverage({
      category: "mainstream",
      source: "media_rss_item",
      sourceTier: 3
    })).toBe(false);
  });

  it("moves one qualified article into the first group without replacing the lead story", () => {
    const ranked = ["lead", "two", "three", "four", "five", "six", "seven", "underground", "nine"];
    const selected = ranked.slice(0, 9);
    const result = promoteEmergingEditorialCoverage({
      ranked,
      selected,
      isEligible: (item) => item === "underground",
      limit: 9,
      promoteIndex: 6
    });

    expect(result[0]).toBe("lead");
    expect(result[6]).toBe("underground");
    expect(result).toHaveLength(9);
  });
});
