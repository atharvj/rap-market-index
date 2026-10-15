import profiles from "@/data/artistTrackingProfiles.json";
import { normalizeArtistNameForMatch } from "@/server/market/artist-name-match";
import type { ArtistExternalIds } from "@/server/market/market-data";

export type TrackingRelease = { id: string; title: string; releaseDate: string; sourceUrl: string; officialReleaseVerified?: boolean; allowStandaloneMatch?: boolean; contextRole?: "artist_release" | "label_compilation" };
export type ArtistTrackingProfile = {
  name: string;
  searchName: string;
  aliases: string[];
  verifiedAt: string;
  sources: string[];
  externalIds: { spotifyId: string; youtubeChannelId: string; youtubeRecordingChannelIds?: string[]; musicbrainzId: string; wikipediaArticleTitle?: string; appleMusicArtistIds?: string[] };
  releases: TrackingRelease[];
  catalogueComplete: boolean;
};
const registry = profiles as Record<string, ArtistTrackingProfile>;
type Identity = { id: string; name: string };

export function getTrackingIdentities(): Identity[] {
  return Object.entries(registry).map(([id, profile]) => ({ id, name: profile.name }));
}

export function getVerifiedTrackingArtistName(artistId: string) {
  return registry[artistId]?.name;
}

export function resolveVerifiedTrackingName(name: string) {
  return Object.values(registry).find(profile => [profile.name, profile.searchName, ...profile.aliases]
    .some(alias => normalizeTrackingText(alias) === normalizeTrackingText(name)))?.name;
}

export function getArtistTrackingProfile(artist: Identity, ids?: ArtistExternalIds) {
  const profile = registry[artist.id];
  if (!profile || normalizeArtistNameForMatch(profile.name) !== normalizeArtistNameForMatch(artist.name)) return undefined;
  if (ids?.musicbrainzId && ids.musicbrainzId !== profile.externalIds.musicbrainzId) return undefined;
  if (ids?.spotifyId && ids.spotifyId !== profile.externalIds.spotifyId) return undefined;
  return profile;
}

export function getTrackingAliases(artist: Identity, ids?: ArtistExternalIds) {
  const profile = getArtistTrackingProfile(artist, ids);
  return [...new Set([profile?.searchName, artist.name, ...(profile?.aliases ?? []), ids?.lastfmName].filter((value): value is string => Boolean(value)))];
}

// Companion channels supply recordings, not extra channel-level audience totals.
// A changed canonical identity must not inherit a previously verified companion.
export function getVerifiedRecordingChannelIds(artist: Identity, ids?: ArtistExternalIds) {
  const primary = ids?.youtubeChannelId;
  const profile = getArtistTrackingProfile(artist, ids);
  const companions = profile && (!primary || primary === profile.externalIds.youtubeChannelId)
    ? profile.externalIds.youtubeRecordingChannelIds ?? [] : [];
  return [...new Set([primary, ...companions].filter((id): id is string => Boolean(id)))];
}

export function getTrackingAliasesByName(name: string) {
  const match = Object.entries(registry).find(([, profile]) => normalizeTrackingText(profile.name) === normalizeTrackingText(name));
  return match ? getTrackingAliases({ id: match[0], name }) : [name];
}

export function applyTrackingExternalIds(ids: ArtistExternalIds): ArtistExternalIds {
  const profile = registry[ids.artistId];
  if (!profile || ids.musicbrainzId !== profile.externalIds.musicbrainzId ||
    (ids.spotifyId && ids.spotifyId !== profile.externalIds.spotifyId)) return ids;
  return { ...ids, wikipediaArticleTitle: ids.wikipediaArticleTitle ?? profile.externalIds.wikipediaArticleTitle };
}

export function getArtistTrackingCoverage(artists: Identity[], externalIds: Record<string, ArtistExternalIds>, runDate: string) {
  return artists.map(artist => {
    const profile = getArtistTrackingProfile(artist, externalIds[artist.id]);
    const releases = getTrackedReleases(artist, runDate, externalIds[artist.id]);
    const wikipediaArticleTitle = externalIds[artist.id]?.wikipediaArticleTitle ?? profile?.externalIds.wikipediaArticleTitle ?? null;
    return { artistId: artist.id, name: artist.name, profileVerifiedAt: profile?.verifiedAt ?? null,
      searchNames: getTrackingAliases(artist, externalIds[artist.id]), wikipediaArticleTitle,
      appleMusicArtistIds: profile?.externalIds.appleMusicArtistIds ?? [],
      releaseContexts: releases.map(release => ({ title: release.title, sourceUrl: release.sourceUrl })),
      gaps: [ ...(!profile ? ["unverified_profile"] : []), ...(!wikipediaArticleTitle ? ["unverified_wikipedia"] : []),
        ...(!profile?.externalIds.appleMusicArtistIds?.length ? ["unverified_apple_music"] : []),
        ...(!releases.length ? ["no_verified_album_context"] : []), ...(profile && !profile.catalogueComplete ? ["partial_catalogue"] : []),
        ...(profile && Date.parse(runDate) - Date.parse(profile.verifiedAt) > 30 * 86400000 ? ["metadata_needs_review"] : []) ] };
  });
}

export function getTrackedReleases(artist: Identity, runDate: string, ids?: ArtistExternalIds) {
  return (getArtistTrackingProfile(artist, ids)?.releases ?? []).filter(release =>
    release.officialReleaseVerified === true && /^\d{4}-\d{2}-\d{2}$/.test(release.releaseDate) && release.releaseDate <= runDate);
}

export function buildTrackingSearchQueries(artist: Identity, runDate: string, ids?: ArtistExternalIds) {
  const profile = getArtistTrackingProfile(artist, ids);
  if (!profile) return [];
  const names = getTrackingAliases(artist, ids);
  const primary = names[0];
  const quote = (value: string) => `"${value.replace(/"/g, "").trim()}"`;
  const nameQuery = (name: string) => name.split(/\s+/).length === 1 && name.length <= 6 ? `${quote(name)} rapper` : quote(name);
  const queries = [nameQuery(primary)];
  const releases = getTrackedReleases(artist, runDate, ids);
  for (const release of releases.filter(release => release.allowStandaloneMatch)) queries.push(`${quote(release.title)} album`);
  const alias = names.find(name => normalizeTrackingText(name).replace(/ /g, "") !== normalizeTrackingText(primary).replace(/ /g, "") && name.length > 3);
  if (alias) queries.push(nameQuery(alias));
  for (const release of releases.filter(release => !release.allowStandaloneMatch)) {
    const title = normalizeTrackingText(release.title);
    if (title.length >= 4) queries.push(`${quote(primary)} ${quote(release.title)}`);
  }
  return [...new Set(queries)].slice(0, 3);
}

export function normalizeTrackingText(value: string) {
  return normalizeArtistNameForMatch(value);
}

export function matchTrackedRelease(text: string, artist: Identity, runDate: string, ids?: ArtistExternalIds) {
  const normalized = normalizeTrackingText(text);
  if (!/\b(album|mixtape|music|song|track|verse|review|listen|listening|rap|rapper)\b/.test(normalized)) return undefined;
  return getTrackedReleases(artist, runDate, ids).find(release => {
    const title = normalizeTrackingText(release.title);
    // Generic/single-word titles cannot independently establish artist identity.
    return release.allowStandaloneMatch === true && title.length >= 8 && title.split(" ").length >= 2 &&
      new RegExp(`(?:^| )${escapePattern(title)}(?:$| )`).test(normalized);
  });
}

export function matchNamedRelease(text: string, artist: Identity, runDate: string, ids?: ArtistExternalIds) {
  const normalized = normalizeTrackingText(text);
  return getTrackedReleases(artist, runDate, ids).find(release => {
    const title = normalizeTrackingText(release.title);
    return title.length >= 4 && new RegExp(`(?:^| )${escapePattern(title)}(?:$| )`).test(normalized);
  });
}

function escapePattern(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
