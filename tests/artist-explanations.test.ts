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
    expect(result).toContain("No verified headline or event was strong enough");
    expect(result).toContain("Movement evidence aligned with the quote");
    expect(result).toContain("audience momentum (+4.25%)");
    expect(result).toContain("video momentum (+2.50%)");
    expect(result).toContain("Counter-signal: fan reception (-0.80%) opposed the move");
    expect(result).toContain("Background context: verified media and review tone was mixed at 55/100");
    expect(result).toContain("Evidence confidence is limited");
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

  it("upgrades legacy recorded-input wording instead of repeating it", () => {
    const explanation = "TEST moved higher. Supporting recorded inputs: audience momentum (+2.00%).";
    const result = sanitizeMoveExplanation("TEST", explanation, 1, {
      streamingGrowth: 2,
      youtubeGrowth: 1,
      searchGrowth: 0,
      socialGrowth: 0,
      newsScore: 50,
      traderDemand: 0
    });

    expect(result).not.toContain("Supporting recorded inputs");
    expect(result).toContain("Movement evidence aligned with the quote");
    expect(result).toContain("Evidence confidence is limited");
  });

  it("does not append the new evidence summary more than once", () => {
    const explanation = "TEST moved higher after a verified release. Evidence confidence is moderate because the evidence aligned.";
    expect(sanitizeMoveExplanation("TEST", explanation, 1, {
      streamingGrowth: 2,
      youtubeGrowth: 1,
      searchGrowth: 0,
      socialGrowth: 0,
      newsScore: 50,
      traderDemand: 0
    })).toBe(explanation);
  });

  it("keeps media tone as context instead of claiming it moved the quote", () => {
    const result = sanitizeMoveExplanation("TEST", null, 1, {
      streamingGrowth: 0,
      youtubeGrowth: 0,
      searchGrowth: 0,
      socialGrowth: 0,
      newsScore: 82,
      traderDemand: 0
    });

    expect(result).toContain("No measured movement input clearly aligned");
    expect(result).toContain("Background context: verified media and review tone was positive at 82/100");
    expect(result).not.toContain("Movement evidence aligned with the quote: verified media");
  });

  it("replaces the legacy generic baseline explanation", () => {
    const result = sanitizeMoveExplanation(
      "TEST",
      "TEST moved higher on baseline market data without a source-backed headline catalyst strong enough to lead the move.",
      0.75,
      {
        streamingGrowth: 1.5,
        youtubeGrowth: 0,
        searchGrowth: 0,
        socialGrowth: 0,
        newsScore: 50,
        traderDemand: 0
      }
    );

    expect(result).not.toContain("baseline market data");
    expect(result).toContain("moved higher by 0.75%");
    expect(result).toContain("audience momentum (+1.50%)");
  });

  it("preserves a current no-catalyst explanation without overstating confidence", () => {
    const noCatalystExplanation =
      "TEST moved higher by 0.75% at the latest market close. No verified headline or event was strong enough to attribute as the primary cause, with limited outside confirmation.";
    const result = sanitizeMoveExplanation(
      "TEST",
      noCatalystExplanation,
      0.75,
      {
        streamingGrowth: 1.5,
        youtubeGrowth: 0,
        searchGrowth: 0,
        socialGrowth: 0,
        newsScore: 50,
        traderDemand: 0
      }
    );

    expect(result).toContain(noCatalystExplanation);
    expect(result.match(/No verified headline or event was strong enough/g)).toHaveLength(1);
    expect(result).toContain("Evidence confidence is limited");
    expect(result).not.toContain("a verified catalyst and measured movement evidence aligned");
  });

  it("keeps a verified catalyst when the quote closes unchanged", () => {
    const result = sanitizeMoveExplanation(
      "TEST",
      "TEST held flat as a verified album release was balanced by broader market signals.",
      0,
      {
        streamingGrowth: 1.5,
        youtubeGrowth: -0.8,
        searchGrowth: 0,
        socialGrowth: 0,
        newsScore: 62,
        traderDemand: 0
      }
    );

    expect(result).toContain("verified album release");
    expect(result).toContain("quote closed unchanged");
    expect(result).toContain("Evidence confidence is moderate");
  });

  it("does not present audience-scale calibration as a verified catalyst", () => {
    const result = sanitizeMoveExplanation(
      "TEST",
      "TEST moved higher as its quote converged toward longer-term audience scale.",
      0.9,
      {
        streamingGrowth: 2.4,
        youtubeGrowth: 0.6,
        searchGrowth: 0,
        socialGrowth: 0,
        newsScore: 55,
        traderDemand: 0
      }
    );

    expect(result).toContain("quote converged toward longer-term audience scale");
    expect(result).toContain("No verified headline or event was strong enough");
    expect(result).toContain("Evidence confidence is limited");
    expect(result).not.toContain("a verified catalyst and measured movement evidence aligned");
  });

  it("does not present relative repricing as a verified catalyst", () => {
    const result = sanitizeMoveExplanation(
      "TEST",
      "TEST pulled back as its signals lagged the day's market momentum.",
      -0.65,
      {
        streamingGrowth: -1.2,
        youtubeGrowth: -0.5,
        searchGrowth: 0,
        socialGrowth: 0,
        newsScore: 48,
        traderDemand: 0
      }
    );

    expect(result).toContain("signals lagged the day's market momentum");
    expect(result).toContain("No verified headline or event was strong enough");
    expect(result).toContain("Evidence confidence is limited");
  });

  it("rejects a directional claim when the quote closes unchanged", () => {
    const result = sanitizeMoveExplanation(
      "TEST",
      "TEST moved higher after a release.",
      0,
      {
        streamingGrowth: 0,
        youtubeGrowth: 0,
        searchGrowth: 0,
        socialGrowth: 0,
        newsScore: 50,
        traderDemand: 0
      }
    );

    expect(result).not.toContain("moved higher");
    expect(result).toContain("held unchanged at the latest market close");
  });
});
