import { describe, expect, it } from "vitest";
import { sanitizeMoveExplanation } from "@/lib/artist-explanations";

describe("artist move explanations", () => {
  it("does not describe an unchanged quote as a rise", () => {
    expect(sanitizeMoveExplanation("MOLLY", "MOLLY moved higher after a release.", 0)).toBe(
      "MOLLY held unchanged at the latest market close."
    );
  });

  it("replaces an explanation that contradicts the saved quote direction", () => {
    expect(sanitizeMoveExplanation("TEST", "TEST moved higher after a release.", -1.2)).toContain("moved lower");
    expect(sanitizeMoveExplanation("TEST", "TEST fell after a review.", 1.2)).toContain("moved higher");
  });

  it("keeps a source-backed explanation when its direction agrees", () => {
    expect(sanitizeMoveExplanation("TEST", "TEST moved higher after a verified release.", 1.2)).toBe(
      "TEST moved higher after a verified release."
    );
  });

  it("adds the strongest supportive recorded inputs when stats are available", () => {
    const result = sanitizeMoveExplanation("TEST", null, 1.2, {
      streamingGrowth: 4.25,
      youtubeGrowth: 2.5,
      searchGrowth: 0.4,
      socialGrowth: -0.8,
      newsScore: 55,
      traderDemand: 0.2
    });

    expect(result).toContain("moved higher by 1.20%");
    expect(result).toContain("audience momentum (+4.25%)");
    expect(result).toContain("video momentum (+2.50%)");
  });

  it("uses weakening inputs to explain a decline", () => {
    const result = sanitizeMoveExplanation("TEST", null, -0.8, {
      streamingGrowth: -3.2,
      youtubeGrowth: -1.4,
      searchGrowth: 0.3,
      socialGrowth: -0.5,
      newsScore: 48,
      traderDemand: 0
    });

    expect(result).toContain("moved lower by 0.80%");
    expect(result).toContain("audience momentum (-3.20%)");
    expect(result).toContain("video momentum (-1.40%)");
  });

  it("does not append recorded inputs more than once", () => {
    const explanation = "TEST moved higher. Supporting recorded inputs: audience momentum (+2.00%).";
    expect(sanitizeMoveExplanation("TEST", explanation, 1, {
      streamingGrowth: 2,
      youtubeGrowth: 1,
      searchGrowth: 0,
      socialGrowth: 0,
      newsScore: 50,
      traderDemand: 0
    })).toBe(explanation);
  });
});
