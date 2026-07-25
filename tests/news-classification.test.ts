import { describe, expect, it } from "vitest";
import { isLowValueMarketArticleTitle } from "@/server/market/artist-event-disambiguation";
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

  it("does not mistake lifestyle headlines for music releases", () => {
    const result = classifyArticleEvent(
      "Lil Wayne Shares Unusual Food Rules Like Hating Mayo and Hiding Milk",
      "hotnewhiphop.com"
    );

    expect(result).toBeNull();
    expect(isLowValueMarketArticleTitle("Lil Wayne Shares Unusual Food Rules Like Hating Mayo")).toBe(true);
  });

  it("rejects beauty and fragrance launches even when the publisher covers music", () => {
    const title = "Ice Spice Launches Debut Fragrance In Ha Mood on Ulta Beauty's TikTok Shop";

    expect(classifyArticleEvent(title, "complex.com")).toBeNull();
    expect(isLowValueMarketArticleTitle(title)).toBe(true);
  });

  it("rejects celebrity participation in a generic TikTok challenge", () => {
    const title = "Watch Millie Bobby Brown, Ice Spice & Lil Yachty Join Drake's 'Shabang' TikTok Challenge";

    expect(classifyArticleEvent(title, "billboard.com")).toBeNull();
    expect(isLowValueMarketArticleTitle(title)).toBe(true);
    expect(isLowValueMarketArticleTitle(`${title} - billboard.com`)).toBe(true);
  });

  it("keeps a measured song trend but gives it less impact than a release", () => {
    const trend = classifyArticleEvent(
      "Ice Spice song sparks TikTok challenge as streaming rises",
      "billboard.com"
    );
    const release = classifyArticleEvent(
      "Ice Spice releases new single with official video",
      "billboard.com"
    );

    expect(trend?.reason).toBe("music_social_trend_terms");
    expect(trend?.impactScore).toBeLessThan(release?.impactScore ?? 0);
  });

  it("does not mistake legal evidence for a music release", () => {
    const result = classifyArticleEvent(
      "Pooh Shiesty Case: Prosecution Unveils New Evidence",
      "hotnewhiphop.com"
    );

    expect(result?.eventType).not.toBe("release");
  });

  it("does not score secondhand beef commentary", () => {
    const title = "DJ Akademiks Reveals The Alleged Real Reason Behind Jay-Z's Beef With Drake";
    const result = classifyArticleEvent(title, "hotnewhiphop.com");

    expect(result?.impactScore).toBe(0);
    expect(isLowValueMarketArticleTitle(title)).toBe(true);
  });

  it("still scores a concrete music release", () => {
    const result = classifyArticleEvent(
      "Lil Baby Releases New Song 'Dead Fresh' With Official Video",
      "complex.com"
    );

    expect(result?.eventType).toBe("release");
    expect(result?.impactScore).toBeGreaterThan(0);
  });

  it("does not score a family comparison just because it went viral", () => {
    const title = "Cardi B Says Her Mom Reacted to Viral Toni Braxton Comparisons";

    expect(classifyArticleEvent(title, "complex.com")).toBeNull();
    expect(isLowValueMarketArticleTitle(title)).toBe(true);
  });

  it("does not classify speculative album credits as a release", () => {
    const title = "Are Jay-Z And Eminem On Rakim's New Album? Here's What We Know";

    expect(classifyArticleEvent(title, "iheart.com")).toBeNull();
    expect(isLowValueMarketArticleTitle(title)).toBe(true);
  });
});
