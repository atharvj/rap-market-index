import { describe, expect, it } from "vitest";
import { getNonCatalystArticleReason } from "@/server/market/article-editorial-context";
import { classifyArticleEvent } from "@/server/market/gdelt-source";
import { hasArtistStatusSubjectContext } from "@/server/market/artist-event-disambiguation";
import { hasNewsArtistAttribution } from "@/server/market/news-artist-attribution";
import { isMarketEventSourceIntegrityValid } from "@/server/market/event-integrity";
import { normalizeStoredMediaReception } from "@/server/market/stored-media-classification";
import { areSameRecordingNewsCoverage } from "@/server/market/news-story-groups";
import { buildEventMarketSignals } from "@/server/market/event-signals";
import { createInitialGameState } from "@/lib/market";
import { shouldRecommendStatusTradingHalt } from "@/server/market/status-events";
import type { MarketEvent } from "@/server/market/market-data";

const obituary =
  "Disco Legend Whose Music Was Covered by Mary J. Blige and Sampled by J. Cole Dead at 72";
const policy =
  "Drake Slams ‘Billboard’s’ New Streaming Rules as YouTube Returns to Charts: ‘This Game So Cooked’";
const promotion =
  "Get a Signed Copy of Lil Baby's New Album 'Fresh' and a Matching Beanie";
const reaction =
  "Joe Budden Couldn’t Have Been Less Enthusiastic While Listening To Lil Baby’s New Album";
function event(title: string, artistId = "lil-baby"): MarketEvent {
  return {
    artistId,
    title,
    eventDate: "2026-11-11",
    eventType: "release",
    impactScore: 52,
    sentimentScore: 34,
    confidence: 0.84,
    sourceUrl: "https://complex.com/story",
    rawPayload: {
      source: "media_rss_item",
      domain: "complex.com",
      sourceTier: 3,
      classificationReason: "release_terms",
      publisherArticleVerified: true,
      publisherHeadlineVerified: true,
      publisherHeadline: title,
    },
  };
}
describe("editorial relevance beyond keyword matches", () => {
  it.each([
    promotion,
    "Shop Drake's Signed Vinyl and New Hoodie",
    "Pre-order the signed CD and merchandise for J. Cole's new album",
  ])("keeps shopping promotions out of catalyst scoring: %s", (title) => {
    expect(getNonCatalystArticleReason(title)).toBe("commerce_promotion");
    expect(classifyArticleEvent(title, "complex.com")?.impactScore ?? 0).toBe(
      0,
    );
    expect(isMarketEventSourceIntegrityValid(event(title))).toBe(false);
  });
  it.each([
    policy,
    "Drake reacts to Billboard's new chart formula",
    "YouTube Returns to Billboard Charts With New Streaming Rules",
  ])(
    "does not turn chart-policy coverage into a chart success: %s",
    (title) => {
      expect(getNonCatalystArticleReason(title)).toBe(
        "chart_policy_commentary",
      );
      expect(classifyArticleEvent(title, "complex.com")?.impactScore ?? 0).toBe(
        0,
      );
    },
  );
  it.each([
    "BigXthaPlug Scores His First No. 1 Rap Album With ‘Better Over Time’",
    "Drake rules the Billboard charts",
    "Drake Debuts at No. 1 After Billboard Changes Its Chart Formula",
    "Lil Baby's New Album Sells 100,000 Copies",
    "Lil Baby Releases New Album ‘Fresh’",
  ])("retains concrete music outcomes and releases: %s", (title) => {
    expect(getNonCatalystArticleReason(title)).toBeNull();
    expect(
      classifyArticleEvent(title, "billboard.com")?.impactScore,
    ).toBeGreaterThan(0);
  });
  it("does not assign the obituary subject's status to an artist in sample credits", () => {
    const rawPayload = {
      source: "media_rss_item",
      statusSubtype: "death",
      publisherArticleVerified: true,
      publisherHeadlineVerified: true,
      publisherHeadline: obituary,
    };
    expect(
      hasArtistStatusSubjectContext({
        artistName: "J. Cole",
        text: obituary,
        statusSubtype: "death",
      }),
    ).toBe(false);
    expect(
      hasNewsArtistAttribution({
        artistName: "J. Cole",
        title: obituary,
        rawPayload,
      }),
    ).toBe(false);
    expect(
      isMarketEventSourceIntegrityValid({
        ...event(obituary, "j-cole"),
        eventType: "news",
        rawPayload,
      }),
    ).toBe(false);
    expect(
      shouldRecommendStatusTradingHalt(
        {
          ...event(obituary, "j-cole"),
          rawPayload: { ...rawPayload, statusHaltRecommended: true },
        },
        "J. Cole",
      ),
    ).toBe(false);
    expect(
      shouldRecommendStatusTradingHalt(
        {
          ...event("J. Cole dies at 72", "j-cole"),
          rawPayload: { statusSubtype: "death", statusHaltRecommended: true },
        },
        "J. Cole",
      ),
    ).toBe(true);
    expect(
      hasArtistStatusSubjectContext({
        artistName: "J. Cole",
        text: "J. Cole dies at 72",
        statusSubtype: "death",
      }),
    ).toBe(true);
  });
  it("applies sample-credit status checks to different artists rather than an article blacklist", () => {
    for (const artistName of [
      "Drake",
      "J. Cole",
      "Travis Scott",
      "Kendrick Lamar",
    ]) {
      expect(
        hasArtistStatusSubjectContext({
          artistName,
          text: `Singer whose songs were sampled by ${artistName} dies at 72`,
          statusSubtype: "death",
        }),
      ).toBe(false);
      expect(
        hasArtistStatusSubjectContext({
          artistName,
          text: `${artistName} hospitalized`,
          statusSubtype: "hospitalization",
        }),
      ).toBe(true);
    }
  });
  it.each([
    [reaction, -1],
    ["Critic Is Impressed While Listening To Lil Baby's New Album", 1],
    ["Critic Listens To Lil Baby's New Album", 0],
  ])("separates a listening opinion from a new release: %s", (title, sign) => {
    const classified = classifyArticleEvent(String(title), "complex.com");
    expect(classified?.eventType).toBe("review");
    expect(Math.sign(classified!.impactScore)).toBe(sign);
    expect(Math.abs(classified!.impactScore)).toBeLessThanOrEqual(18);
  });
  it("corrects stored positive-release metadata before display and price scoring", () => {
    const corrected = normalizeStoredMediaReception(
      event(reaction),
      "Lil Baby",
    );
    expect(corrected).toMatchObject({
      eventType: "review",
      impactScore: -18,
      rawPayload: {
        releaseKind: null,
        classificationReason: "listening_reaction_terms",
      },
    });
    const artist = createInitialGameState().artists.find(
      (a) => a.id === "lil-baby",
    )!;
    const signals = buildEventMarketSignals({
      artists: [artist],
      runDate: "2026-11-11",
      eventsByArtist: { [artist.id]: [event(reaction)] },
    });
    expect(signals[artist.id].stats.newsScore ?? 50).toBeLessThanOrEqual(50);
    expect(
      signals[artist.id].modifiers?.every((m) => (m.priceShock ?? 0) <= 0),
    ).toBe(true);
  });
  it("keeps ads, chart-policy reactions and incidental death reports out of pricing", () => {
    for (const [title, artistId] of [
      [promotion, "lil-baby"],
      [policy, "drake"],
      [obituary, "j-cole"],
    ]) {
      const artist = {
        ...createInitialGameState().artists[0],
        id: artistId,
        name:
          artistId === "j-cole"
            ? "J. Cole"
            : artistId === "drake"
              ? "Drake"
              : "Lil Baby",
      };
      const row = event(title, artistId);
      if (title === obituary) row.rawPayload.statusSubtype = "death";
      expect(
        buildEventMarketSignals({
          artists: [artist],
          runDate: "2026-11-11",
          eventsByArtist: { [artist.id]: [row] },
        }),
      ).toEqual({});
    }
  });
  it("does not reward a chart failure merely because the headline says new song", () => {
    expect(
      classifyArticleEvent(
        "Kid Rock and Eminem's New Song Fails to Crack Billboard's Major Charts",
        "billboard.com",
      ),
    ).toMatchObject({ eventType: "news", reason: "decline_terms" });
    expect(
      classifyArticleEvent(
        "Kid Rock and Eminem's New Song Fails to Crack Billboard's Major Charts",
        "billboard.com",
      )!.impactScore,
    ).toBeLessThan(0);
  });
  it("deduplicates the same recording across credited artists but preserves later video releases", () => {
    const first = {
      id: "one",
      artist_id: "drake",
      event_date: "2026-11-06",
      event_type: "viral",
      source_url: "https://complex.com/song",
      title:
        'Drake Reunites With Travis Scott on New Future Track "Ya Hit" f/ Loe Shimmy and Sexyy Red',
    };
    const second = {
      ...first,
      id: "two",
      artist_id: "future",
      title:
        "Ya Hit – Song by Future featuring Drake, Travis Scott, & Loe Shimmy",
    };
    expect(areSameRecordingNewsCoverage(first, second)).toBe(true);
    const video = {
      ...second,
      event_date: "2026-11-10",
      title:
        "Future ft. Drake, Travis Scott & Loe Shimmy - Ya Hit (Official Music Video)",
    };
    expect(areSameRecordingNewsCoverage(first, video)).toBe(false);
    expect(
      areSameRecordingNewsCoverage(video, {
        ...video,
        artist_id: "drake",
        title:
          "Future Drops “Ya Hit” Music Video With Drake, Loe Shimmy, Travis Scott, And Sexyy Red",
      }),
    ).toBe(true);
    expect(
      areSameRecordingNewsCoverage(first, {
        ...second,
        title: 'Drake and Future Release New Track "Different Song"',
      }),
    ).toBe(false);
  });
});
