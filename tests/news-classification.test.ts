import { describe, expect, it } from "vitest";
import {
  hasArtistControversySubjectContext,
  hasArtistStatusSubjectContext,
  hasRequiredArtistEventDisambiguation,
  isLowValueMarketArticleTitle
} from "@/server/market/artist-event-disambiguation";
import { classifyArticleEvent, mentionsArtist } from "@/server/market/gdelt-source";

describe("market news classification", () => {
  it("classifies branded tour announcements with words between the action and tour", () => {
    const result = classifyArticleEvent(
      "Young Thug Announces YSL Tour",
      "pitchfork.com"
    );

    expect(result?.eventType).toBe("tour");
    expect(result?.impactScore).toBeGreaterThan(0);
  });

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

  it("treats a concert cancellation after a crew death as a tour disruption", () => {
    const result = classifyArticleEvent(
      "J. Cole Cancels Sacramento Concert After Crew Member's Death",
      "billboard.com"
    );

    expect(result?.eventType).toBe("tour");
    expect(result?.impactScore).toBeLessThan(0);
    expect(result?.impactScore).toBeGreaterThan(-31);
  });

  it("treats a plaintiff's procedural defamation appeal as legal news, not a blanket controversy", () => {
    const result = classifyArticleEvent(
      "Jay-Z's Defamation Lawsuit Against Lawyer Who Filed Rape Case Faces Skeptical Appeals Court",
      "billboard.com"
    );

    expect(result?.eventType).toBe("news");
    expect(Math.abs(result?.impactScore ?? 100)).toBeLessThan(18);
  });

  it("rejects trial attendance and secondhand arrest commentary as low-value market stories", () => {
    const trialSupport = "Kanye West Shows Up to Support Lil Durk at Murder-for-Hire Trial";
    const arrestCommentary = "6ix9ine Says Lil Durk's Arrest Proves Him Right: 'I'm Smarter Than Y'all'";

    expect(isLowValueMarketArticleTitle(trialSupport)).toBe(true);
    expect(isLowValueMarketArticleTitle(arrestCommentary)).toBe(true);
  });

  it("keeps a direct arrest materially negative", () => {
    const result = classifyArticleEvent(
      "BigXthaPlug Arrested and Charged After Traffic Stop",
      "apnews.com"
    );

    expect(result?.eventType).toBe("controversy");
    expect(result?.statusSubtype).toBe("legal_arrest");
    expect(result?.impactScore).toBeLessThanOrEqual(-30);
  });

  it("requires returned coverage to name the artist even for distinctive artist names", () => {
    expect(hasRequiredArtistEventDisambiguation({
      artistName: "DC The Don",
      text: "Oscars: South Korea Selects Possible Love for International Feature",
      sourceTier: 3
    })).toBe(false);
    expect(mentionsArtist(
      "South Korea picks Lee Chang-dong's Possible Love as Best International Feature",
      "DC The Don",
      '"DC The Don" rapper'
    )).toBe(false);
  });

  it("does not assign another person's medical or legal story to an artist who is merely mentioned", () => {
    expect(hasArtistStatusSubjectContext({
      artistName: "Lil Baby",
      text: "Quality Control founder hospitalized after helping launch Lil Baby",
      statusSubtype: "hospitalization"
    })).toBe(false);
    expect(hasArtistControversySubjectContext({
      artistName: "Lil Wayne",
      text: "Young Thug's lawyers seek dismissal in trial involving alleged plot against Lil Wayne"
    })).toBe(false);
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
