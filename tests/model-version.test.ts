import { describe, expect, it } from "vitest";
import { shouldRebaseAudienceValuation } from "@/server/market/model-version";

describe("market model valuation transitions", () => {
  it("rebases legacy models when they first cross the audience-scale change", () => {
    expect(shouldRebaseAudienceValuation("rmi-core-v21", "rmi-core-v24")).toBe(true);
    expect(shouldRebaseAudienceValuation("rmi-core-v21", "rmi-core-v25")).toBe(true);
  });

  it("does not rebase ordinary model revisions after v24", () => {
    expect(shouldRebaseAudienceValuation("rmi-core-v24", "rmi-core-v25")).toBe(false);
    expect(shouldRebaseAudienceValuation("rmi-core-v25", "rmi-core-v26")).toBe(false);
  });

  it("does not infer a rebase from custom or missing version labels", () => {
    expect(shouldRebaseAudienceValuation(null, "rmi-core-v25")).toBe(false);
    expect(shouldRebaseAudienceValuation("custom-model", "rmi-core-v25")).toBe(false);
  });
});
