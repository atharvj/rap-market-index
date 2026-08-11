import { describe, expect, it } from "vitest";
import { buildSparklinePath } from "@/lib/sparkline";

describe("mini sparkline paths", () => {
  const coordinates = [
    { x: 0, y: 20 },
    { x: 40, y: 8 },
    { x: 100, y: 14 }
  ];

  it("draws recorded intraday repricings as discrete steps", () => {
    expect(buildSparklinePath(coordinates, "step")).toBe(
      "M0.00,20.00 H40.00 V8.00 H100.00 V14.00"
    );
  });

  it("keeps daily-close series connected linearly", () => {
    expect(buildSparklinePath(coordinates, "linear")).toBe(
      "M0.00,20.00 L40.00,8.00 L100.00,14.00"
    );
  });
});
