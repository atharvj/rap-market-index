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
});
