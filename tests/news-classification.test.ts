import { describe, expect, it } from "vitest";
import { classifyArticleEvent } from "@/server/market/gdelt-source";

describe("market news classification", () => {
  it("does not classify an unrelated bet win as an award", () => {
    const result = classifyArticleEvent(
      "Drake Pulls Up To FIFA World Cup Final To See If He Won His Massive Bet",
      "hotnewhiphop.com"
    );

    expect(result?.eventType).not.toBe("award");
  });

  it("classifies a documented award win as an award", () => {
    const result = classifyArticleEvent(
      "Drake wins Grammy Award for best melodic rap performance",
      "grammy.com"
    );

    expect(result?.eventType).toBe("award");
  });
});
