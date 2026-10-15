import { describe, expect, it } from "vitest";
import profiles from "@/data/artistTrackingProfiles.json";
import { applyTrackingExternalIds, buildTrackingSearchQueries, getArtistTrackingProfile, getTrackedReleases, matchTrackedRelease } from "@/server/market/artist-tracking";
import { resolveRecordingArtists } from "@/server/market/recording-credits";

const thug = { id: "young-thug", name: "Young Thug" };
describe("verified artist tracking", () => {
  it("does not apply a saved identity to a replacement artist or conflicting provider IDs", () => {
    expect(getArtistTrackingProfile({ ...thug, name: "Other Artist" })).toBeUndefined();
    expect(getArtistTrackingProfile(thug, { artistId: thug.id, musicbrainzId: "other-id" })).toBeUndefined();
    expect(applyTrackingExternalIds({ artistId: thug.id, musicbrainzId: "other-id" }).wikipediaArticleTitle).toBeUndefined();
  });
  it("fills a verified linked page without overwriting an operator's explicit mapping", () => {
    const ids = { artistId: thug.id, musicbrainzId: profiles["young-thug"].externalIds.musicbrainzId };
    expect(applyTrackingExternalIds(ids).wikipediaArticleTitle).toBe("Young Thug");
    expect(applyTrackingExternalIds({ ...ids, wikipediaArticleTitle: "Operator page" }).wikipediaArticleTitle).toBe("Operator page");
  });
  it("searches both named albums while preserving their original release dates", () => {
    const queries = buildTrackingSearchQueries(thug, "2026-10-14");
    expect(queries).toContain('"UY SCUTI" album');
    expect(queries).toContain('"Slime Language 3" album');
    expect(getTrackedReleases(thug, "2026-08-27").some(r => r.title === "Slime Language 3")).toBe(false);
  });
  it("requires music context for standalone titles and excludes astronomy and generic album names", () => {
    expect(matchTrackedRelease("UY SCUTI album is trash", thug, "2026-10-14")?.title).toBe("UY SCUTI");
    expect(matchTrackedRelease("UY SCUTI is a huge red star", thug, "2026-10-14")).toBeUndefined();
    expect(matchTrackedRelease("BUSINESS IS BUSINESS album review", thug, "2026-10-14")).toBeUndefined();
  });
  it("uses verified stage names in explicit credits without treating a song title as a credit", () => {
    const youngboy = { id: "youngboy-never-broke-again", name: "YoungBoy Never Broke Again", ticker: "YB" };
    const artists = [{ ...thug, ticker: "THUG" }, youngboy];
    expect(resolveRecordingArtists({ title: "Young Thug - Song (feat. NBA Youngboy)", primaryArtistId: thug.id, artists }).map(a => a.id)).toContain(youngboy.id);
    expect(resolveRecordingArtists({ title: "Young Thug - NBA Youngboy", primaryArtistId: thug.id, artists }).map(a => a.id)).toEqual([thug.id]);
  });
  it("keeps generic fallback behavior for a new artist without a vetted profile", () => {
    expect(buildTrackingSearchQueries({ id: "new", name: "New Artist" }, "2026-10-14")).toEqual([]);
  });
});

it("admits corroborated companion recording channels without overriding a changed primary identity", async () => {
  const { getVerifiedRecordingChannelIds } = await import("@/server/market/artist-tracking");
  const artist = { id: "ye", name: "Ye" }, primary = "UCs6eXM7s8Vl5WcECcRHc2qQ", companion = "UChpJbg7zMbi5jx9Gdjaxa9g";
  expect(getVerifiedRecordingChannelIds(artist, { artistId: "ye", youtubeChannelId: primary })).toEqual([primary, companion]);
  expect(getVerifiedRecordingChannelIds(artist, { artistId: "ye", youtubeChannelId: "UC-new-primary" })).toEqual(["UC-new-primary"]);
  expect(getVerifiedRecordingChannelIds(artist, { artistId: "ye", youtubeChannelId: primary, musicbrainzId: "wrong-identity" })).toEqual([primary]);
  expect(getVerifiedRecordingChannelIds({ id: "ye", name: "Another Artist" }, { artistId: "ye", youtubeChannelId: primary })).toEqual([primary]);
});
