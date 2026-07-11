import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { AdapterSignals, MarketEvent, MarketSignalModifier } from "@/server/market/market-data";
import { getArtistStatusSubtype } from "@/server/market/status-events";
import type { HypeStats } from "@/lib/types";

export type ManualMarketEventInput = {
  artistId?: string;
  ticker?: string;
  eventDate?: string;
  eventType?: MarketEvent["eventType"];
  title?: string;
  sourceName?: string;
  sourceUrl?: string;
  sentimentScore?: number;
  impactScore?: number;
  confidence?: number;
  rawPayload?: Record<string, unknown>;
};

export type ManualMarketEvents = Record<string, ManualMarketEventInput[]>;

export function buildEventMarketSignals({
  artists,
  runDate,
  eventsByArtist
}: {
  artists: MarketUpdateArtist[];
  runDate: string;
  eventsByArtist: Record<string, MarketEvent[]>;
}): AdapterSignals {
  const signals: AdapterSignals = {};

  for (const artist of artists) {
    const events = eventsByArtist[artist.id] ?? [];

    if (!events.length) {
      continue;
    }

    signals[artist.id] = buildArtistEventSignal(artist, runDate, events);
  }

  return signals;
}

export function normalizeManualMarketEvents({
  manualEvents,
  artists,
  runDate
}: {
  manualEvents?: ManualMarketEvents;
  artists: MarketUpdateArtist[];
  runDate: string;
}) {
  if (!manualEvents || typeof manualEvents !== "object") {
    return {};
  }

  const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
  const artistsByTicker = new Map(artists.map((artist) => [artist.ticker, artist]));
  const normalized: Record<string, MarketEvent[]> = {};

  for (const [key, values] of Object.entries(manualEvents)) {
    const artist = artistsById.get(key) ?? artistsByTicker.get(key.toUpperCase());

    if (!artist || !Array.isArray(values)) {
      continue;
    }

    for (const value of values) {
      const event = normalizeOneManualEvent(value, artist, runDate);

      if (!event) {
        continue;
      }

      normalized[artist.id] ??= [];
      normalized[artist.id].push(event);
    }
  }

  return normalized;
}

export function normalizeManualMarketEventList({
  events,
  artists,
  runDate
}: {
  events?: ManualMarketEventInput[];
  artists: MarketUpdateArtist[];
  runDate: string;
}) {
  if (!Array.isArray(events)) {
    return {};
  }

  const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
  const artistsByTicker = new Map(artists.map((artist) => [artist.ticker, artist]));
  const normalized: Record<string, MarketEvent[]> = {};

  for (const value of events) {
    const artistKey = value.artistId ?? value.ticker;
    const artist = artistKey ? artistsById.get(artistKey) ?? artistsByTicker.get(artistKey.toUpperCase()) : null;

    if (!artist) {
      continue;
    }

    const event = normalizeOneManualEvent(value, artist, runDate);

    if (!event) {
      continue;
    }

    normalized[artist.id] ??= [];
    normalized[artist.id].push(event);
  }

  return normalized;
}

export function mergeEvents(
  first: Record<string, MarketEvent[]>,
  second: Record<string, MarketEvent[]>
) {
  const merged: Record<string, MarketEvent[]> = {};

  for (const artistId of new Set([...Object.keys(first), ...Object.keys(second)])) {
    merged[artistId] = dedupeSemanticallyEquivalentEvents([
      ...(first[artistId] ?? []),
      ...(second[artistId] ?? [])
    ]);
  }

  return merged;
}

export function flattenEvents(eventsByArtist: Record<string, MarketEvent[]>) {
  return Object.values(eventsByArtist).flat();
}

function buildArtistEventSignal(artist: MarketUpdateArtist, runDate: string, events: MarketEvent[]) {
  const uniqueEvents = dedupeSemanticallyEquivalentEvents(events);
  const scoredEvents = applyEventClusterCaps(
    uniqueEvents.map((event) => scoreEvent(event, runDate, artist)),
    artist
  );
  const totalSignal = scoredEvents.reduce((total, event) => total + event.weightedImpact, 0);
  const reviewSignal = scoredEvents
    .filter((event) => event.event.eventType === "review")
    .reduce((total, event) => total + event.weightedImpact, 0);
  const releaseSignal = scoredEvents
    .filter((event) => event.event.eventType === "release")
    .reduce((total, event) => total + Math.max(0, event.weightedImpact), 0);
  const controversySignal = scoredEvents
    .filter((event) => event.event.eventType === "controversy")
    .reduce((total, event) => total + event.weightedImpact, 0);
  const newsSignal = scoredEvents
    .filter((event) => event.event.eventType === "news" || event.event.eventType === "viral")
    .reduce((total, event) => total + event.weightedImpact, 0);
  const sourceConfirmedEventCount = scoredEvents.filter((event) => event.clusterSourceCount > 1).length;
  const stats: Partial<HypeStats> = {
    searchGrowth: clamp(totalSignal * 0.18 + newsSignal * 0.12, -30, 95),
    socialGrowth: clamp(totalSignal * 0.2 + releaseSignal * 0.18, -35, 120),
    newsScore: clamp(50 + totalSignal * 0.32 + reviewSignal * 0.22 + controversySignal * 0.18, 0, 100)
  };
  const modifiers = buildPriceModifiers(scoredEvents);

  return {
    stats,
    modifiers,
    confidence: getEventSignalConfidence(scoredEvents),
    rawPayload: {
      source: "market_events",
      eventCount: uniqueEvents.length,
      rawEventCount: events.length,
      totalSignal,
      reviewSignal,
      releaseSignal,
      sourceConfirmedEventCount,
      events: scoredEvents.map((event) => ({
        title: event.event.title,
        eventType: event.event.eventType,
        eventDate: event.event.eventDate,
        sentimentScore: event.event.sentimentScore,
        impactScore: event.event.impactScore,
        confidence: event.event.confidence,
        decay: event.decay,
        ageDays: event.ageDays,
        provenanceLabel: event.provenanceLabel,
        provenanceImpactMultiplier: event.provenanceImpactMultiplier,
        provenanceConfidenceMultiplier: event.provenanceConfidenceMultiplier,
        eventSubtype: event.eventSubtype,
        shockDecayMultiplier: event.shockDecayMultiplier,
        clusterKey: event.clusterKey,
        clusterMultiplier: event.clusterMultiplier,
        clusterSourceCount: event.clusterSourceCount,
        clusterConfirmationMultiplier: event.clusterConfirmationMultiplier,
        releaseCycleAnchorTitle: event.releaseCycleAnchorTitle,
        releaseCycleSourceCount: event.releaseCycleSourceCount,
        releaseCycleRelatedCount: event.releaseCycleRelatedCount,
        releaseCycleReceptionImpact: event.releaseCycleReceptionImpact,
        releaseCycleMultiplier: event.releaseCycleMultiplier,
        reactionSourceClass: event.reactionSourceClass,
        reactionConsensusLabel: event.reactionConsensusLabel,
        reactionConsensusMultiplier: event.reactionConsensusMultiplier,
        reactionConfirmingSourceCount: event.reactionConfirmingSourceCount,
        reactionOpposingSourceCount: event.reactionOpposingSourceCount,
        reactionNetPublicImpact: event.reactionNetPublicImpact,
        evidenceSafetyLabel: event.evidenceSafetyLabel,
        evidenceSafetyMultiplier: event.evidenceSafetyMultiplier,
        uncappedWeightedImpact: event.uncappedWeightedImpact,
        shockWeightedImpact: event.shockWeightedImpact,
        weightedImpact: event.weightedImpact
      }))
    }
  };
}

type ScoredMarketEvent = ReturnType<typeof scoreEvent> & {
  clusterKey: string;
  clusterMultiplier: number;
  clusterSourceCount: number;
  clusterConfirmationMultiplier: number;
  eventSubtype: string;
  shockDecayMultiplier: number;
  shockWeightedImpact: number;
  uncappedWeightedImpact: number;
  releaseCycleAnchorTitle: string | null;
  releaseCycleSourceCount: number;
  releaseCycleRelatedCount: number;
  releaseCycleReceptionImpact: number;
  releaseCycleMultiplier: number;
  reactionSourceClass: string;
  reactionConsensusLabel: string;
  reactionConsensusMultiplier: number;
  reactionConfirmingSourceCount: number;
  reactionOpposingSourceCount: number;
  reactionNetPublicImpact: number;
  evidenceSafetyLabel: string;
  evidenceSafetyMultiplier: number;
};

function getEventSignalConfidence(scoredEvents: ScoredMarketEvent[]) {
  const highestConfidence = scoredEvents.reduce(
    (highest, event) =>
      Math.max(highest, event.event.confidence * event.decay * event.provenanceConfidenceMultiplier),
    0
  );
  const maxSourceCount = scoredEvents.reduce(
    (highest, event) => Math.max(highest, event.clusterSourceCount, event.releaseCycleSourceCount),
    0
  );
  const averageAbsImpact =
    scoredEvents.reduce((total, event) => total + Math.abs(event.weightedImpact), 0) /
    Math.max(1, scoredEvents.length);
  const breadthLift = clamp((maxSourceCount - 1) * 0.055, 0, 0.14);
  const impactLift = clamp(averageAbsImpact / 800, 0, 0.09);
  const eventCountLift = clamp(Math.log10(scoredEvents.length + 1) * 0.04, 0, 0.08);

  return clamp(0.32 + highestConfidence * 0.47 + breadthLift + impactLift + eventCountLift, 0.35, 0.92);
}

function buildPriceModifiers(scoredEvents: ScoredMarketEvent[]): MarketSignalModifier[] {
  const modifiers: MarketSignalModifier[] = [];
  const visibleEvents = suppressTrackLevelReleaseModifiers(scoredEvents);

  for (const event of visibleEvents) {
    const score = event.shockWeightedImpact;
    const isReview = event.event.eventType === "review";
    const isRelease = event.event.eventType === "release";
    const subtypeProfile = getEventSubtypePriceProfile(event.eventSubtype);
    const reviewShock = isReview ? clamp(score / 1700, -0.05, 0.045) : undefined;
    const releaseShock = isRelease
      ? clamp(score / subtypeProfile.divisor, subtypeProfile.minShock, subtypeProfile.maxShock)
      : undefined;
    const generalShock = !isRelease && !isReview
      ? clamp(score / subtypeProfile.divisor, subtypeProfile.minShock, subtypeProfile.maxShock)
      : undefined;
    const priceShock = reviewShock ?? releaseShock ?? generalShock;

    if (priceShock === undefined || Math.abs(score) < 3.5) {
      continue;
    }

    modifiers.push({
      reason: getEventModifierReason(event),
      priceShock,
      score,
      reasonPriority: getEventReasonPriority(event.eventSubtype)
    });
  }

  return modifiers;
}

function suppressTrackLevelReleaseModifiers(scoredEvents: ScoredMarketEvent[]) {
  const specificProjectReleases = scoredEvents.filter(
    (event) => event.eventSubtype === "project_release" && isSpecificProjectReleaseTitle(event)
  );

  return scoredEvents.filter((event) => {
    if (
      event.eventSubtype === "project_release" &&
      event.shockWeightedImpact > 0 &&
      isGenericProjectReleaseHeadline(event) &&
      specificProjectReleases.some(
        (candidate) => candidate !== event && Math.abs(daysBetween(candidate.event.eventDate, event.event.eventDate)) <= 3
      )
    ) {
      return false;
    }

    if (event.eventSubtype !== "track_audio_release" && event.eventSubtype !== "single_video_release") {
      return true;
    }

    if (event.shockWeightedImpact <= 0) {
      return true;
    }

    return !scoredEvents.some((candidate) => {
      if (candidate === event || candidate.eventSubtype !== "project_release" || candidate.shockWeightedImpact <= 0) {
        return false;
      }

      return Math.abs(daysBetween(candidate.event.eventDate, event.event.eventDate)) <= 3;
    });
  });
}

function isSpecificProjectReleaseTitle(event: ScoredMarketEvent) {
  const inferredTitle = getRawString(event.event.rawPayload.inferredReleaseTitle);

  if (inferredTitle) {
    return true;
  }

  const title = event.event.title.trim();

  return /^[^-]+ - [^-]+$/.test(title);
}

function isGenericProjectReleaseHeadline(event: ScoredMarketEvent) {
  const title = normalizeEventText(event.event.title);

  return hasAnyTerm(title, [
    "new albums",
    "albums you should listen",
    "songs you should listen",
    "and more",
    "weekly roundup",
    "best new music",
    "project release cycle"
  ]);
}

function getEventModifierReason(event: ScoredMarketEvent) {
  const title = event.event.title;
  const labels: Record<string, string> = {
    project_release: "project release",
    single_video_release: "single/video release",
    track_audio_release: "track upload",
    tracklist_reaction: "tracklist reaction",
    feature: "feature/cosign",
    major_feature: "major feature/cosign",
    performance: "live performance",
    social_conflict: "social conflict",
    late_reception: "late reception",
    public_reaction: "public reaction",
    status_death: "artist status",
    status_legal_arrest: "legal status",
    status_legal_charge: "legal charge",
    status_legal_conviction: "legal conviction",
    status_legal_sentencing: "legal sentencing",
    status_legal_incarceration: "legal status",
    status_legal_release: "legal release",
    status_hospitalization: "health status",
    status_injury: "injury status",
    chart: "chart momentum",
    snippet: "snippet",
    controversy: "controversy",
    decline: "decline chatter",
    review: "review/reception",
    release: "release",
    viral: "viral moment",
    news: "news",
    award: "award",
    tour: "tour"
  };

  return `${labels[event.eventSubtype] ?? event.event.eventType}: ${title}`;
}

function getEventReasonPriority(subtype: string) {
  const priorities: Record<string, number> = {
    project_release: 12,
    status_death: 13,
    status_legal_sentencing: 12,
    status_legal_conviction: 12,
    review: 11,
    major_feature: 11,
    feature: 10,
    status_legal_release: 10,
    status_legal_incarceration: 10,
    status_hospitalization: 9,
    status_legal_charge: 9,
    status_legal_arrest: 9,
    performance: 9,
    social_conflict: 9,
    status_injury: 8,
    chart: 8,
    late_reception: 8,
    tracklist_reaction: 8,
    public_reaction: 8,
    controversy: 8,
    decline: 8,
    single_video_release: 5,
    snippet: 4,
    viral: 4,
    release: 4,
    news: 3,
    award: 3,
    tour: 2,
    track_audio_release: 1
  };

  return priorities[subtype] ?? 0;
}

function scoreEvent(event: MarketEvent, runDate: string, artist: MarketUpdateArtist) {
  const ageDays = Math.max(0, daysBetween(event.eventDate, runDate));
  const decay = getEventDecay(event.eventType, ageDays);
  const typeWeight = getEventTypeWeight(event.eventType);
  const sentiment = event.sentimentScore;
  const impact = event.impactScore || sentiment;
  const provenance = getEventProvenance(event, artist);
  const weightedImpact = clamp(
    (impact * 0.65 + sentiment * 0.35) *
      event.confidence *
      typeWeight *
      decay *
      provenance.impactMultiplier,
    -100,
    100
  );

  return {
    event,
    ageDays,
    decay,
    provenanceLabel: provenance.label,
    provenanceImpactMultiplier: provenance.impactMultiplier,
    provenanceConfidenceMultiplier: provenance.confidenceMultiplier,
    weightedImpact
  };
}

function getEventProvenance(event: MarketEvent, artist: MarketUpdateArtist) {
  const source = getRawString(event.rawPayload.source) ?? "";
  const normalizedSource = source.toLowerCase();

  if (normalizedSource === "reddit_post") {
    return getRedditEventProvenance(event, artist);
  }

  if (normalizedSource === "bluesky_post") {
    return {
      label: "bluesky-disabled",
      impactMultiplier: 0,
      confidenceMultiplier: 0.25
    };
  }

  if (normalizedSource === "gdelt_article") {
    return getGdeltEventProvenance(event);
  }

  if (normalizedSource === "media_rss_item") {
    return getMediaRssEventProvenance(event);
  }

  if (normalizedSource === "ai_research_event") {
    return getAiResearchEventProvenance(event, artist);
  }

  if (normalizedSource === "musicbrainz_release_group") {
    const corroborated = getRawBoolean(event.rawPayload.corroborated);

    return {
      label: corroborated ? "release-database-corroborated" : "release-database-metadata-only",
      impactMultiplier: corroborated ? 0.78 : 0,
      confidenceMultiplier: corroborated ? 0.82 : 0.2
    };
  }

  if (normalizedSource === "youtube_upload_event") {
    return getYoutubeUploadEventProvenance(event);
  }

  if (normalizedSource === "manual_event") {
    return {
      label: "manual",
      impactMultiplier: 0.95,
      confidenceMultiplier: 0.95
    };
  }

  return {
    label: normalizedSource || "unknown",
    impactMultiplier: 1,
    confidenceMultiplier: 1
  };
}

function getYoutubeUploadEventProvenance(event: MarketEvent) {
  const quality = getYoutubeUploadEventQuality(event);

  if (!quality.accepted) {
    return {
      label: `official-upload-${quality.label}`,
      impactMultiplier: 0,
      confidenceMultiplier: 0.25
    };
  }

  const storedMultiplier = getRawOptionalNumber(event.rawPayload.uploadQualityMultiplier);
  const multiplier = clamp(Math.min(storedMultiplier ?? 1, quality.multiplier), 0, 1);

  return {
    label: multiplier < 1 ? `official-upload-${quality.label}` : "official-upload",
    impactMultiplier: 1.03 * multiplier,
    confidenceMultiplier: clamp(0.72 + multiplier * 0.28, 0.35, 1)
  };
}

function getYoutubeUploadEventQuality(event: MarketEvent) {
  const normalizedTitle = normalizeEventText(event.title);
  const reason =
    getRawString(event.rawPayload.classificationReason) ??
    getRawString(event.rawPayload.reason) ??
    getRawString(event.rawPayload.eventReason) ??
    "";
  const storedMultiplier = getRawOptionalNumber(event.rawPayload.uploadQualityMultiplier);
  const viewCount =
    getRawOptionalNumber(event.rawPayload.viewCount) ??
    getRawOptionalNumber(event.rawPayload.representativeViewCount) ??
    getRawOptionalNumber(event.rawPayload.clusterMaxViews);
  const relatedUploadCount = getRawOptionalNumber(event.rawPayload.relatedUploadCount) ?? 0;
  const clusterTotalViews = getRawOptionalNumber(event.rawPayload.clusterTotalViews) ?? 0;
  const clusterReachRatio = getRawOptionalNumber(event.rawPayload.clusterReachRatio);
  const hasNamedProject = Boolean(getRawString(event.rawPayload.inferredReleaseTitle));
  const durationSeconds = getRawOptionalNumber(event.rawPayload.durationSeconds);
  const hasLowSignalTitle = hasLowSignalYoutubeUploadTitle(event.title, normalizedTitle);
  const isPromoTitle = isPromoHashtagYoutubeUploadTitle(event.title, normalizedTitle);
  const isShortForm =
    (typeof durationSeconds === "number" && durationSeconds > 0 && durationSeconds <= 75) || hasLowSignalTitle;
  const lowReach = typeof viewCount === "number" && viewCount < 15_000;
  const modestReach = typeof viewCount === "number" && viewCount < 35_000;
  const weakCatalyst = [
    "snippet_upload_title",
    "performance_upload_title",
    "track_audio_upload_title",
    "tour_upload_title"
  ].includes(reason);
  const hasExplicitRelease = hasExplicitYoutubeReleaseLanguage(normalizedTitle);
  const releaseKind = getRawString(event.rawPayload.releaseKind) ?? "";
  const hasProjectEvidence =
    hasNamedProject ||
    relatedUploadCount >= 3 ||
    clusterTotalViews >= 120_000 ||
    (typeof clusterReachRatio === "number" && clusterReachRatio >= 0.45);
  const titleOnlyProjectGuess = reason === "album_announcement_upload_title" && !hasProjectEvidence;
  const majorReleaseCatalyst =
    reason === "album_announcement_upload_title" ||
    reason === "major_feature_upload_title" ||
    ["album", "ep", "mixtape", "project"].includes(releaseKind);

  if (reason === "official_audio_release_cluster") {
    const label = getRawString(event.rawPayload.clusterReachLabel) ?? "release-cluster";
    const isGenericProjectCycle = normalizeEventText(event.title).includes("project release cycle");
    const hasMeaningfulProjectEvidence =
      hasNamedProject ||
      relatedUploadCount >= 3 ||
      clusterTotalViews >= 180_000 ||
      (typeof clusterReachRatio === "number" && clusterReachRatio >= 0.55);
    const hasBreakoutStandaloneReach =
      !hasNamedProject &&
      relatedUploadCount >= 2 &&
      (clusterTotalViews >= 650_000 ||
        (typeof viewCount === "number" && viewCount >= 450_000) ||
        (typeof clusterReachRatio === "number" && clusterReachRatio >= 1.4));

    if (!hasMeaningfulProjectEvidence && !hasBreakoutStandaloneReach) {
      return {
        accepted: false,
        label: "weak-release-cluster-without-project-reach",
        multiplier: 0
      };
    }

    if (isGenericProjectCycle && !hasNamedProject && clusterTotalViews < 350_000) {
      return {
        accepted: false,
        label: "generic-release-cycle-without-project-source",
        multiplier: 0
      };
    }

    const fallbackMultiplier = isGenericProjectCycle ? 0.34 : hasNamedProject ? 0.86 : 0.58;

    return {
      accepted: true,
      label,
      multiplier: clamp(storedMultiplier ?? fallbackMultiplier, 0.18, 1.08)
    };
  }

  if (titleOnlyProjectGuess) {
    const hasExceptionalStandaloneReach = typeof viewCount === "number" && viewCount >= 750_000 && !isShortForm;

    if (!hasExceptionalStandaloneReach) {
      return {
        accepted: false,
        label: "title-only-project-without-evidence",
        multiplier: 0
      };
    }
  }

  if ((hasLowSignalTitle || isPromoTitle) && !hasExplicitRelease) {
    return {
      accepted: false,
      label: "low-signal-title",
      multiplier: 0
    };
  }

  if ((isShortForm || lowReach) && weakCatalyst) {
    return {
      accepted: false,
      label: isShortForm ? "short-form-weak-catalyst" : "low-reach-weak-catalyst",
      multiplier: 0
    };
  }

  if (isShortForm && !hasExplicitRelease) {
    return {
      accepted: false,
      label: "short-form-without-release-language",
      multiplier: 0
    };
  }

  if (lowReach && !majorReleaseCatalyst) {
    return {
      accepted: false,
      label: "low-reach-minor-upload",
      multiplier: 0
    };
  }

  if (isShortForm && modestReach) {
    return {
      accepted: true,
      label: "short-form-dampened",
      multiplier: 0.58
    };
  }

  if (lowReach) {
    return {
      accepted: true,
      label: "low-reach-dampened",
      multiplier: 0.68
    };
  }

  if (modestReach) {
    return {
      accepted: true,
      label: "modest-reach-dampened",
      multiplier: 0.84
    };
  }

  return {
    accepted: true,
    label: "accepted",
    multiplier: 1
  };
}

function hasLowSignalYoutubeUploadTitle(rawTitle: string, normalizedTitle: string) {
  return (
    hasAnyWholeEventTerm(normalizedTitle, [
      "behind the scenes",
      "day in the life",
      "documentary",
      "episode",
      "explore",
      "explorepage",
      "for you",
      "foryou",
      "fyp",
      "full interview",
      "gaming",
      "interview",
      "podcast",
      "reaction",
      "recap",
      "shorts",
      "stream highlights",
      "tour vlog",
      "vlog",
      "youtube shorts",
      "yt shorts"
    ]) ||
    /#(?:shorts?|ytshorts|fyp|foryou|explore|explorepage)\b/i.test(rawTitle)
  );
}

function isPromoHashtagYoutubeUploadTitle(rawTitle: string, normalizedTitle: string) {
  const hashtagCount = rawTitle.match(/#[a-z0-9_]+/gi)?.length ?? 0;
  const wordCount = normalizedTitle ? normalizedTitle.split(/\s+/).length : 0;

  return hashtagCount >= 2 && wordCount <= 8;
}

function hasExplicitYoutubeReleaseLanguage(normalizedTitle: string) {
  return hasAnyWholeEventTerm(normalizedTitle, [
    "album",
    "album trailer",
    "deluxe",
    "ep",
    "mixtape",
    "music video",
    "new single",
    "new song",
    "official audio",
    "official video",
    "out now",
    "project",
    "single",
    "tracklist",
    "visualizer"
  ]);
}

function getRedditEventProvenance(event: MarketEvent, artist: MarketUpdateArtist) {
  const viralityTier = getRawString(event.rawPayload.viralityTier) ?? "small";
  const subredditTier = getRawNumber(event.rawPayload.subredditTier, 0);
  const socialCatalystKind = getRawString(event.rawPayload.socialCatalystKind);
  const audienceMultiplier = getCommunityAudienceMultiplier(artist);
  const tierProfiles: Record<string, { impact: number; confidence: number }> = {
    small: { impact: 0.58, confidence: 0.82 },
    notable: { impact: 0.95, confidence: 1 },
    major: { impact: 1.18, confidence: 1.08 },
    breakout: { impact: 1.36, confidence: 1.14 }
  };
  const profile = tierProfiles[viralityTier] ?? tierProfiles.small;
  const subredditLift = clamp(1 + subredditTier * 0.045, 1, 1.1);
  const catalystMultiplier =
    socialCatalystKind === "conflict" || socialCatalystKind === "backlash" || socialCatalystKind === "late_reception"
      ? { impact: 1.12, confidence: 1.06 }
      : socialCatalystKind === "snippet_hype" || socialCatalystKind === "performance_hype"
        ? { impact: 1.06, confidence: 1.03 }
        : { impact: 1, confidence: 1 };

  return {
    label: `reddit-${viralityTier}`,
    impactMultiplier: clamp(
      profile.impact * subredditLift * audienceMultiplier.impact * catalystMultiplier.impact,
      0.5,
      1.58
    ),
    confidenceMultiplier: clamp(
      profile.confidence * subredditLift * audienceMultiplier.confidence * catalystMultiplier.confidence,
      0.75,
      1.26
    )
  };
}

function getBlueskyEventProvenance(event: MarketEvent, artist: MarketUpdateArtist) {
  const viralityTier = getRawString(event.rawPayload.viralityTier) ?? "small";
  const socialCatalystKind = getRawString(event.rawPayload.socialCatalystKind);
  const audienceMultiplier = getCommunityAudienceMultiplier(artist);
  const tierProfiles: Record<string, { impact: number; confidence: number }> = {
    small: { impact: 0.28, confidence: 0.62 },
    notable: { impact: 0.55, confidence: 0.78 },
    major: { impact: 0.74, confidence: 0.9 },
    breakout: { impact: 0.9, confidence: 0.98 }
  };
  const profile = tierProfiles[viralityTier] ?? tierProfiles.small;
  const catalystMultiplier =
    socialCatalystKind === "conflict" || socialCatalystKind === "backlash" || socialCatalystKind === "late_reception"
      ? { impact: 1.18, confidence: 1.08 }
      : socialCatalystKind === "snippet_hype" || socialCatalystKind === "performance_hype"
        ? { impact: 1.08, confidence: 1.04 }
        : { impact: 1, confidence: 1 };

  return {
    label: `bluesky-${viralityTier}`,
    impactMultiplier: clamp(profile.impact * audienceMultiplier.impact * catalystMultiplier.impact, 0.22, 1.08),
    confidenceMultiplier: clamp(
      profile.confidence * audienceMultiplier.confidence * catalystMultiplier.confidence,
      0.55,
      1.1
    )
  };
}

function getCommunityAudienceMultiplier(artist: MarketUpdateArtist) {
  if (artist.category === "underground") {
    return { impact: 1.28, confidence: 1.06 };
  }

  if (artist.category === "rising") {
    return { impact: 1.14, confidence: 1.03 };
  }

  if (artist.category === "superstar") {
    return { impact: 0.88, confidence: 0.98 };
  }

  return { impact: 1, confidence: 1 };
}

function getGdeltEventProvenance(event: MarketEvent) {
  const sourceTier = getRawNumber(event.rawPayload.sourceTier, 0);
  const tierProfiles: Record<number, { impact: number; confidence: number }> = {
    0: { impact: 0.52, confidence: 0.82 },
    1: { impact: 0.92, confidence: 0.98 },
    2: { impact: 1.05, confidence: 1.05 },
    3: { impact: 1.15, confidence: 1.1 }
  };
  const profile = tierProfiles[sourceTier] ?? tierProfiles[0];

  return {
    label: `news-tier-${sourceTier}`,
    impactMultiplier: profile.impact,
    confidenceMultiplier: profile.confidence
  };
}

function getMediaRssEventProvenance(event: MarketEvent) {
  const sourceTier = getRawNumber(event.rawPayload.sourceTier, 0);
  const feedScope = getRawString(event.rawPayload.feedScope);
  const tierProfiles: Record<number, { impact: number; confidence: number }> = {
    0: { impact: 0.48, confidence: 0.78 },
    1: { impact: 0.9, confidence: 0.98 },
    2: { impact: 1.03, confidence: 1.05 },
    3: { impact: 1.12, confidence: 1.1 }
  };
  const profile = tierProfiles[sourceTier] ?? tierProfiles[0];
  const searchMultiplier = feedScope === "artist_search" ? 0.88 : 1;

  return {
    label: `media-rss-tier-${sourceTier}`,
    impactMultiplier: clamp(profile.impact * searchMultiplier, 0.42, 1.16),
    confidenceMultiplier: clamp(profile.confidence * searchMultiplier, 0.68, 1.12)
  };
}

function getAiResearchEventProvenance(event: MarketEvent, artist: MarketUpdateArtist) {
  const sourceTier = getRawNumber(event.rawPayload.sourceTier, 0);
  const evidenceLevel = getRawString(event.rawPayload.evidenceLevel) ?? "reported";
  const sourceType = getRawString(event.rawPayload.sourceType) ?? "";
  const reachScope = getRawString(event.rawPayload.reachScope) ?? "";
  const corroboratingSourceCount = getRawOptionalNumber(event.rawPayload.corroboratingSourceCount) ?? 1;
  const publicReactionConfirmed = getRawBoolean(event.rawPayload.publicReactionConfirmed);
  const fanReactionEvidenceCount = getRawOptionalNumber(event.rawPayload.fanReactionEvidenceCount) ?? 0;
  const sentimentAgreement = getRawString(event.rawPayload.sentimentAgreement) ?? "unknown";
  const factualClaimConfirmed = getRawBoolean(event.rawPayload.factualClaimConfirmed);
  const audienceMultiplier = getCommunityAudienceMultiplier(artist);
  const tierProfiles: Record<number, { impact: number; confidence: number }> = {
    0: { impact: 0.74, confidence: 0.88 },
    1: { impact: 0.98, confidence: 1.02 },
    2: { impact: 1.1, confidence: 1.1 },
    3: { impact: 1.18, confidence: 1.16 }
  };
  const evidenceProfiles: Record<string, { impact: number; confidence: number }> = {
    confirmed: { impact: 1.08, confidence: 1.08 },
    reported: { impact: 1, confidence: 1 },
    rumor: { impact: 0.56, confidence: 0.72 },
    low_signal: { impact: 0.22, confidence: 0.35 }
  };
  const sourceTypeProfiles: Record<string, { impact: number; confidence: number }> = {
    review: { impact: 1.12, confidence: 1.1 },
    official: { impact: 1.08, confidence: 1.08 },
    mainstream_news: { impact: 1.05, confidence: 1.08 },
    music_publication: { impact: 1.04, confidence: 1.06 },
    community: { impact: 0.9, confidence: 0.94 },
    social: { impact: 0.78, confidence: 0.86 },
    video: { impact: 0.82, confidence: 0.9 }
  };
  const reachProfiles: Record<string, { impact: number; confidence: number }> = {
    mainstream: { impact: 1.12, confidence: 1.04 },
    broad: { impact: 1.08, confidence: 1.03 },
    scene: { impact: 1.02, confidence: 1 },
    underground: { impact: 1.02, confidence: 0.98 }
  };
  const tier = tierProfiles[sourceTier] ?? tierProfiles[0];
  const evidence = evidenceProfiles[evidenceLevel] ?? evidenceProfiles.reported;
  const source = sourceTypeProfiles[sourceType] ?? { impact: 1, confidence: 1 };
  const reach = reachProfiles[reachScope] ?? { impact: 1, confidence: 1 };
  const communityLift = sourceType === "community" || reachScope === "underground" || reachScope === "scene"
    ? audienceMultiplier
    : { impact: 1, confidence: 1 };
  const isSocialOrCommunity = sourceType === "social" || sourceType === "community";
  const receptionMultiplier =
    sentimentAgreement === "disagree"
      ? { impact: 0.7, confidence: 0.82 }
      : sentimentAgreement === "mixed"
        ? { impact: 0.84, confidence: 0.9 }
        : { impact: 1, confidence: 1 };

  if (hasHighRiskEvidenceFlags(event)) {
    return {
      label: `ai-research-${sourceType || "source"}-rejected-risk`,
      impactMultiplier: 0,
      confidenceMultiplier: 0.25
    };
  }

  if (evidenceLevel === "rumor" || evidenceLevel === "low_signal") {
    return {
      label: `ai-research-${sourceType || "source"}-unconfirmed`,
      impactMultiplier: 0,
      confidenceMultiplier: 0.3
    };
  }

  if (
    isSocialOrCommunity &&
    (!factualClaimConfirmed ||
      !publicReactionConfirmed ||
      corroboratingSourceCount < 2 ||
      fanReactionEvidenceCount < 2)
  ) {
    return {
      label: `ai-research-${sourceType}-needs-confirmation`,
      impactMultiplier: 0.14,
      confidenceMultiplier: 0.4
    };
  }

  return {
    label: `ai-research-${sourceType || "source"}-${evidenceLevel}`,
    impactMultiplier: clamp(
      tier.impact * evidence.impact * source.impact * reach.impact * communityLift.impact * receptionMultiplier.impact,
      0.32,
      1.28
    ),
    confidenceMultiplier: clamp(
      tier.confidence *
        evidence.confidence *
        source.confidence *
        reach.confidence *
        communityLift.confidence *
        receptionMultiplier.confidence,
      0.5,
      1.2
    )
  };
}

function applyEventClusterCaps(
  scoredEvents: Array<ReturnType<typeof scoreEvent>>,
  artist: MarketUpdateArtist
): ScoredMarketEvent[] {
  const groups = scoredEvents.reduce<Record<string, Array<ReturnType<typeof scoreEvent>>>>((memo, event) => {
    const sign = event.weightedImpact < 0 ? "negative" : "positive";
    const key = `${event.event.eventType}:${event.event.eventDate}:${sign}`;

    memo[key] ??= [];
    memo[key].push(event);
    return memo;
  }, {});
  const multipliers = new Map<
    ReturnType<typeof scoreEvent>,
    { key: string; multiplier: number; sourceCount: number; confirmationMultiplier: number }
  >();

  for (const [key, events] of Object.entries(groups)) {
    const eventType = events[0]?.event.eventType ?? "news";
    const cap = getEventClusterCap(eventType);
    const sourceCount = countDistinctEventSources(events);
    const confirmationMultiplier = getClusterConfirmationMultiplier(sourceCount);
    const total = events.reduce((sum, event) => sum + event.weightedImpact * confirmationMultiplier, 0);
    const multiplier = Math.abs(total) > cap ? cap / Math.abs(total) : 1;

    for (const event of events) {
      multipliers.set(event, { key, multiplier, sourceCount, confirmationMultiplier });
    }
  }

  const clusteredEvents = scoredEvents.map((event) => {
    const cluster = multipliers.get(event) ?? {
      key: "unclustered",
      multiplier: 1,
      sourceCount: 1,
      confirmationMultiplier: 1
    };
    const confirmedImpact = event.weightedImpact * cluster.confirmationMultiplier;
    const eventSubtype = getEventSubtype(event.event, artist);
    const shockDecayMultiplier = getEventShockDecayMultiplier({
      eventType: event.event.eventType,
      eventSubtype,
      ageDays: event.ageDays
    });
    const weightedImpact = clamp(confirmedImpact * cluster.multiplier, -100, 100);

    return {
      ...event,
      clusterKey: cluster.key,
      clusterMultiplier: cluster.multiplier,
      clusterSourceCount: cluster.sourceCount,
      clusterConfirmationMultiplier: cluster.confirmationMultiplier,
      eventSubtype,
      shockDecayMultiplier,
      releaseCycleAnchorTitle: null,
      releaseCycleSourceCount: 1,
      releaseCycleRelatedCount: 0,
      releaseCycleReceptionImpact: 0,
      releaseCycleMultiplier: 1,
      reactionSourceClass: "unknown",
      reactionConsensusLabel: "not_checked",
      reactionConsensusMultiplier: 1,
      reactionConfirmingSourceCount: 0,
      reactionOpposingSourceCount: 0,
      reactionNetPublicImpact: 0,
      evidenceSafetyLabel: "not_checked",
      evidenceSafetyMultiplier: 1,
      uncappedWeightedImpact: event.weightedImpact,
      shockWeightedImpact: clamp(weightedImpact * shockDecayMultiplier, -100, 100),
      weightedImpact
    };
  });

  return applyReleaseCycleContext(applyEvidenceSafetyContext(applyReactionConsensusContext(clusteredEvents)));
}

function applyEvidenceSafetyContext(scoredEvents: ScoredMarketEvent[]): ScoredMarketEvent[] {
  return scoredEvents.map((event) => {
    const safety = getEvidenceSafetyAdjustment(event);
    const weightedImpact = clamp(event.weightedImpact * safety.multiplier, -100, 100);
    const shockWeightedImpact = clamp(event.shockWeightedImpact * safety.multiplier, -100, 100);

    return {
      ...event,
      evidenceSafetyLabel: safety.label,
      evidenceSafetyMultiplier: safety.multiplier,
      weightedImpact,
      shockWeightedImpact
    };
  });
}

function getEvidenceSafetyAdjustment(event: ScoredMarketEvent) {
  const sourceClass = getReactionSourceClass(event);
  const source = getRawString(event.event.rawPayload.source) ?? "";
  const evidenceLevel = getRawString(event.event.rawPayload.evidenceLevel) ?? "";
  const isSocialOrCommunity = sourceClass === "social" || sourceClass === "community";

  if (hasHighRiskEvidenceFlags(event)) {
    return {
      label: "rejected_high_risk_evidence",
      multiplier: 0
    };
  }

  if (evidenceLevel === "rumor" || evidenceLevel === "low_signal") {
    return {
      label: "rejected_unconfirmed_evidence",
      multiplier: 0
    };
  }

  const featureAdjustment = getFeatureEvidenceAdjustment(event);

  if (featureAdjustment.multiplier < 1) {
    return featureAdjustment;
  }

  if (!isSocialOrCommunity) {
    return {
      label: "not_social_evidence",
      multiplier: 1
    };
  }

  const corroboratingSourceCount = getRawOptionalNumber(event.event.rawPayload.corroboratingSourceCount) ?? 1;
  const publicReactionConfirmed = getRawBoolean(event.event.rawPayload.publicReactionConfirmed);
  const factualClaimConfirmed = getRawBoolean(event.event.rawPayload.factualClaimConfirmed);
  const hasClusterConfirmation =
    event.clusterSourceCount >= 2 ||
    event.reactionConfirmingSourceCount >= 1 ||
    corroboratingSourceCount >= 2 ||
    publicReactionConfirmed;
  const strongCommunitySignal = hasStrongCommunitySignal(event);
  const isAiSocialEvent = source === "ai_research_event";
  const isPositive = event.weightedImpact > 4;

  if (isAiSocialEvent && (!factualClaimConfirmed || !hasClusterConfirmation)) {
    return {
      label: "ai_social_needs_independent_confirmation",
      multiplier: 0.12
    };
  }

  if (!hasClusterConfirmation && !strongCommunitySignal) {
    return {
      label: isPositive ? "unconfirmed_positive_fan_hype" : "unconfirmed_social_claim",
      multiplier: isPositive ? 0.2 : 0.34
    };
  }

  if (!hasClusterConfirmation) {
    return {
      label: "strong_but_single_community_signal",
      multiplier: isPositive ? 0.48 : 0.62
    };
  }

  return {
    label: "social_evidence_confirmed",
    multiplier: 1
  };
}

function getFeatureEvidenceAdjustment(event: ScoredMarketEvent) {
  if (event.eventSubtype !== "feature" && event.eventSubtype !== "major_feature") {
    return {
      label: "not_feature_evidence",
      multiplier: 1
    };
  }

  const publicReactionConfirmed = getRawBoolean(event.event.rawPayload.publicReactionConfirmed);
  const corroboratingSourceCount = getRawOptionalNumber(event.event.rawPayload.corroboratingSourceCount) ?? 1;
  const fanReactionEvidenceCount = getRawOptionalNumber(event.event.rawPayload.fanReactionEvidenceCount) ?? 0;
  const reachScope = getRawString(event.event.rawPayload.reachScope) ?? "";
  const broadReach = reachScope === "broad" || reachScope === "mainstream";
  const sourceCount = Math.max(event.clusterSourceCount, corroboratingSourceCount);

  if (publicReactionConfirmed && fanReactionEvidenceCount >= 2 && sourceCount >= 2) {
    return {
      label: "feature_with_confirmed_public_reaction",
      multiplier: 1
    };
  }

  if (broadReach && sourceCount >= 2) {
    return {
      label: "feature_with_broad_confirmed_reach",
      multiplier: event.eventSubtype === "major_feature" ? 0.82 : 0.68
    };
  }

  if (sourceCount >= 2) {
    return {
      label: "feature_confirmed_without_broad_reaction",
      multiplier: event.eventSubtype === "major_feature" ? 0.62 : 0.48
    };
  }

  return {
    label: "feature_credit_without_reaction_confirmation",
    multiplier: event.eventSubtype === "major_feature" ? 0.42 : 0.28
  };
}

function applyReactionConsensusContext(scoredEvents: ScoredMarketEvent[]): ScoredMarketEvent[] {
  return scoredEvents.map((event) => {
    const sourceClass = getReactionSourceClass(event);
    const relatedEvents = scoredEvents.filter((candidate) => isReactionConsensusRelated(event, candidate));
    const publicRelatedEvents = relatedEvents.filter((candidate) => isPublicReactionSource(getReactionSourceClass(candidate)));
    const eventSign = getImpactSign(event.weightedImpact);
    const confirmingEvents = publicRelatedEvents.filter((candidate) => getImpactSign(candidate.weightedImpact) === eventSign);
    const opposingEvents = publicRelatedEvents.filter((candidate) => getImpactSign(candidate.weightedImpact) === -eventSign);
    const confirmingSourceCount = countDistinctReactionClasses(confirmingEvents);
    const opposingSourceCount = countDistinctReactionClasses(opposingEvents);
    const netPublicImpact = publicRelatedEvents.reduce((total, candidate) => total + candidate.weightedImpact, 0);
    const consensus = getReactionConsensusAdjustment({
      event,
      sourceClass,
      confirmingSourceCount,
      opposingSourceCount,
      netPublicImpact
    });
    const weightedImpact = clamp(event.weightedImpact * consensus.multiplier, -100, 100);
    const shockWeightedImpact = clamp(event.shockWeightedImpact * consensus.multiplier, -100, 100);

    return {
      ...event,
      reactionSourceClass: sourceClass,
      reactionConsensusLabel: consensus.label,
      reactionConsensusMultiplier: consensus.multiplier,
      reactionConfirmingSourceCount: confirmingSourceCount,
      reactionOpposingSourceCount: opposingSourceCount,
      reactionNetPublicImpact: clamp(netPublicImpact, -100, 100),
      weightedImpact,
      shockWeightedImpact
    };
  });
}

function getReactionConsensusAdjustment({
  event,
  sourceClass,
  confirmingSourceCount,
  opposingSourceCount,
  netPublicImpact
}: {
  event: ScoredMarketEvent;
  sourceClass: string;
  confirmingSourceCount: number;
  opposingSourceCount: number;
  netPublicImpact: number;
}) {
  if (!isReactionSensitiveEvent(event)) {
    return {
      label: "not_reaction_sensitive",
      multiplier: 1
    };
  }

  const eventSign = getImpactSign(event.weightedImpact);
  const publicSign = getImpactSign(netPublicImpact);
  const hasPublicDisagreement = publicSign !== 0 && publicSign === -eventSign && opposingSourceCount > 0;
  const hasPublicConfirmation = publicSign === eventSign && confirmingSourceCount > 0;

  if ((sourceClass === "critic" || sourceClass === "media") && hasPublicDisagreement) {
    return {
      label: "public_disagrees_with_critic",
      multiplier: 0.58
    };
  }

  if ((sourceClass === "critic" || sourceClass === "media") && !hasPublicConfirmation) {
    return {
      label: "critic_unconfirmed_by_public",
      multiplier: event.eventSubtype === "review" ? 0.76 : 0.82
    };
  }

  if ((sourceClass === "community" || sourceClass === "social") && hasPublicDisagreement) {
    return {
      label: "public_reaction_split",
      multiplier: 0.7
    };
  }

  if (sourceClass === "social" && confirmingSourceCount === 0 && event.clusterSourceCount <= 1) {
    return {
      label: "social_reaction_unconfirmed",
      multiplier: 0.58
    };
  }

  if (sourceClass === "community" && confirmingSourceCount === 0 && event.clusterSourceCount <= 1) {
    return {
      label: "community_reaction_unconfirmed",
      multiplier: 0.72
    };
  }

  if (hasPublicConfirmation && confirmingSourceCount >= 2) {
    return {
      label: "broad_public_confirmation",
      multiplier: 1.14
    };
  }

  if (hasPublicConfirmation) {
    return {
      label: "public_confirmation",
      multiplier: 1.06
    };
  }

  return {
    label: "neutral_consensus",
    multiplier: 1
  };
}

function isReactionConsensusRelated(event: ScoredMarketEvent, candidate: ScoredMarketEvent) {
  if (event === candidate) {
    return false;
  }

  const distance = Math.abs(daysBetween(event.event.eventDate, candidate.event.eventDate));

  if (distance > getReactionConsensusWindowDays(event, candidate)) {
    return false;
  }

  if (isReactionSensitiveEvent(event) && isReactionSensitiveEvent(candidate)) {
    return true;
  }

  return (
    event.eventSubtype === "project_release" &&
    ["review", "late_reception", "tracklist_reaction", "public_reaction", "viral", "performance"].includes(
      candidate.eventSubtype
    )
  );
}

function getReactionConsensusWindowDays(event: ScoredMarketEvent, candidate: ScoredMarketEvent) {
  if (
    event.eventSubtype === "review" ||
    candidate.eventSubtype === "review" ||
    event.eventSubtype === "late_reception" ||
    candidate.eventSubtype === "late_reception"
  ) {
    return 10;
  }

  if (event.eventSubtype === "project_release" || candidate.eventSubtype === "project_release") {
    return 7;
  }

  return 4;
}

function isReactionSensitiveEvent(event: ScoredMarketEvent) {
  return [
    "review",
    "tracklist_reaction",
    "public_reaction",
    "performance",
    "snippet",
    "viral",
    "controversy",
    "social_conflict",
    "late_reception",
    "decline"
  ].includes(event.eventSubtype);
}

function getReactionSourceClass(event: ScoredMarketEvent) {
  const source = getRawString(event.event.rawPayload.source) ?? "";
  const sourceName = (event.event.sourceName ?? "").toLowerCase();
  const domain = (getRawString(event.event.rawPayload.domain) ?? "").toLowerCase();

  if (source === "reddit_post") {
    return "community";
  }

  if (source === "bluesky_post") {
    return "social";
  }

  if (source === "youtube_upload_event") {
    return "official";
  }

  if (source === "musicbrainz_release_group") {
    return "release_database";
  }

  if (source === "ai_research_event") {
    const sourceType = getRawString(event.event.rawPayload.sourceType) ?? "";

    if (sourceType === "community") {
      return "community";
    }

    if (sourceType === "social") {
      return "social";
    }

    if (sourceType === "review" || event.eventSubtype === "review") {
      return "critic";
    }

    if (sourceType === "official") {
      return "official";
    }

    return "media";
  }

  if (event.eventSubtype === "review" || event.eventSubtype === "public_reaction") {
    if (isReviewerLikeSource(sourceName) || isReviewerLikeSource(domain)) {
      return "critic";
    }
  }

  if (source === "gdelt_article" || source === "media_rss_item") {
    return event.eventSubtype === "review" ? "critic" : "media";
  }

  if (source === "manual_event") {
    return "manual";
  }

  return source || "unknown";
}

function isPublicReactionSource(sourceClass: string) {
  return sourceClass === "community" || sourceClass === "social" || sourceClass === "critic" || sourceClass === "media";
}

function countDistinctReactionClasses(events: ScoredMarketEvent[]) {
  return new Set(events.map((event) => getReactionSourceClass(event))).size;
}

function getImpactSign(value: number) {
  if (value >= 4) {
    return 1;
  }

  if (value <= -4) {
    return -1;
  }

  return 0;
}

function isReviewerLikeSource(value: string) {
  return hasAnyTerm(value, [
    "albumoftheyear",
    "anthony fantano",
    "dead end hip hop",
    "fantano",
    "pitchfork",
    "rapreviews",
    "review",
    "reviewer",
    "theneedledrop",
    "the needle drop",
    "youtube.com"
  ]);
}

function applyReleaseCycleContext(scoredEvents: ScoredMarketEvent[]): ScoredMarketEvent[] {
  const projectReleases = scoredEvents.filter((event) => event.eventSubtype === "project_release");

  if (!projectReleases.length) {
    return scoredEvents;
  }

  return scoredEvents.map((event) => {
    const project = findNearestProjectRelease(event, projectReleases);

    if (!project) {
      return event;
    }

    const relatedEvents = scoredEvents.filter(
      (candidate) =>
        candidate !== project &&
        candidate.eventSubtype !== "project_release" &&
        isReleaseCycleRelated(candidate) &&
        Math.abs(daysBetween(project.event.eventDate, candidate.event.eventDate)) <= getReleaseCycleWindowDays(candidate)
    );
    const sourceCount = countDistinctScoredSources([project, ...relatedEvents]);
    const receptionImpact = relatedEvents
      .filter((candidate) =>
        candidate.eventSubtype === "tracklist_reaction" ||
        candidate.eventSubtype === "review" ||
        candidate.eventSubtype === "public_reaction"
      )
      .reduce((total, candidate) => total + candidate.weightedImpact, 0);
    const relatedPositiveCount = relatedEvents.filter((candidate) => candidate.weightedImpact > 0).length;
    const cycleMultiplier = clamp(
      1 + Math.min(0.14, relatedPositiveCount * 0.025) + clamp(receptionImpact / 900, -0.12, 0.1),
      0.82,
      1.18
    );

    if (event === project) {
      return {
        ...event,
        releaseCycleAnchorTitle: project.event.title,
        releaseCycleSourceCount: sourceCount,
        releaseCycleRelatedCount: relatedEvents.length,
        releaseCycleReceptionImpact: clamp(receptionImpact, -100, 100),
        releaseCycleMultiplier: cycleMultiplier,
        weightedImpact: clamp(
          event.weightedImpact * cycleMultiplier + clamp(receptionImpact * 0.22, -18, 14),
          -100,
          100
        ),
        shockWeightedImpact: clamp(
          event.shockWeightedImpact * cycleMultiplier + clamp(receptionImpact * 0.18, -14, 10),
          -100,
          100
        )
      };
    }

    if (event.eventSubtype === "track_audio_release" || event.eventSubtype === "single_video_release") {
      const reductionMultiplier = event.eventSubtype === "track_audio_release" ? 0.18 : 0.38;

      return {
        ...event,
        releaseCycleAnchorTitle: project.event.title,
        releaseCycleSourceCount: sourceCount,
        releaseCycleRelatedCount: relatedEvents.length,
        releaseCycleReceptionImpact: clamp(receptionImpact, -100, 100),
        releaseCycleMultiplier: reductionMultiplier,
        weightedImpact: clamp(event.weightedImpact * reductionMultiplier, -100, 100),
        shockWeightedImpact: clamp(event.shockWeightedImpact * reductionMultiplier, -100, 100)
      };
    }

    return {
      ...event,
      releaseCycleAnchorTitle: project.event.title,
      releaseCycleSourceCount: sourceCount,
      releaseCycleRelatedCount: relatedEvents.length,
      releaseCycleReceptionImpact: clamp(receptionImpact, -100, 100),
      releaseCycleMultiplier: 1
    };
  });
}

function findNearestProjectRelease(event: ScoredMarketEvent, projectReleases: ScoredMarketEvent[]) {
  const candidates = projectReleases
    .map((project) => ({
      project,
      distance: Math.abs(daysBetween(project.event.eventDate, event.event.eventDate))
    }))
    .filter(({ distance }) => distance <= getReleaseCycleWindowDays(event))
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.project ?? null;
}

function isReleaseCycleRelated(event: ScoredMarketEvent) {
  return [
    "single_video_release",
    "track_audio_release",
    "tracklist_reaction",
    "late_reception",
    "public_reaction",
    "review",
    "snippet",
    "feature",
    "major_feature",
    "chart"
  ].includes(event.eventSubtype);
}

function getReleaseCycleWindowDays(event: ScoredMarketEvent) {
  if (event.eventSubtype === "tracklist_reaction" || event.eventSubtype === "snippet") {
    return 14;
  }

  if (event.eventSubtype === "late_reception") {
    return 28;
  }

  if (event.eventSubtype === "review" || event.eventSubtype === "public_reaction" || event.eventSubtype === "chart") {
    return 10;
  }

  return 5;
}

function countDistinctScoredSources(events: ScoredMarketEvent[]) {
  return countDistinctEventSources(events);
}

function countDistinctEventSources(events: Array<ReturnType<typeof scoreEvent>>) {
  return new Set(
    events.map((event) => normalizeEventSource(event.event.sourceName ?? getRawString(event.event.rawPayload.source) ?? "unknown"))
  ).size;
}

function normalizeEventSource(value: string) {
  const normalized = value.toLowerCase().trim();

  if (normalized.startsWith("reddit/")) {
    return normalized;
  }

  if (normalized === "bluesky" || normalized.includes("bsky.app")) {
    return "bluesky";
  }

  if (normalized.includes("youtube")) {
    return "youtube";
  }

  if (normalized.includes("musicbrainz")) {
    return "musicbrainz";
  }

  if (normalized.includes("gdelt")) {
    return "gdelt";
  }

  if (normalized.includes("rss") || normalized.includes("news.google.com")) {
    return "media-rss";
  }

  if (normalized.includes("ai-research") || normalized.includes("ai_research")) {
    return "ai-research";
  }

  try {
    const host = new URL(normalized).hostname.replace(/^www\./, "");
    return host || normalized;
  } catch {
    return normalized || "unknown";
  }
}

function getClusterConfirmationMultiplier(sourceCount: number) {
  if (sourceCount >= 3) {
    return 1.18;
  }

  if (sourceCount === 2) {
    return 1.1;
  }

  return 1;
}

function normalizeOneManualEvent(
  input: ManualMarketEventInput,
  artist: MarketUpdateArtist,
  runDate: string
): MarketEvent | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const eventType = input.eventType && isMarketEventType(input.eventType) ? input.eventType : "news";
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 160) : null;

  if (!title) {
    return null;
  }

  return {
    artistId: artist.id,
    eventDate: typeof input.eventDate === "string" && input.eventDate ? input.eventDate : runDate,
    eventType,
    title,
    sourceName: typeof input.sourceName === "string" ? input.sourceName.slice(0, 80) : undefined,
    sourceUrl: typeof input.sourceUrl === "string" ? input.sourceUrl.slice(0, 500) : undefined,
    sentimentScore: getFiniteNumber(input.sentimentScore, 0, -100, 100),
    impactScore: getFiniteNumber(input.impactScore, input.sentimentScore ?? 0, -100, 100),
    confidence: getFiniteNumber(input.confidence, 0.65, 0, 1),
    rawPayload: input.rawPayload ?? {
      source: "manual_event"
    }
  };
}

function getEventSubtype(event: MarketEvent, artist?: MarketUpdateArtist) {
  const rawReason =
    getRawString(event.rawPayload.classificationReason) ??
    getRawString(event.rawPayload.reason) ??
    getRawString(event.rawPayload.eventReason);
  const text = normalizeEventText(`${rawReason ?? ""} ${event.title}`);
  const statusSubtype = getArtistStatusSubtype(event.rawPayload.statusSubtype);
  const artistRole = getRawString(event.rawPayload.artistRole);

  if (statusSubtype) {
    return `status_${statusSubtype}`;
  }

  if (artistRole === "featured") {
    return "feature";
  }

  const normalizedArtistName = artist ? normalizeEventText(artist.name) : "";
  const titleIdentifiesArtistAsFeature =
    normalizedArtistName &&
    (event.eventType === "release" || event.eventType === "viral") &&
    hasAnyTerm(text, [
      `featuring ${normalizedArtistName}`,
      `feat ${normalizedArtistName}`,
      `ft ${normalizedArtistName}`
    ]);

  if (titleIdentifiesArtistAsFeature) {
    return "feature";
  }

  if (event.eventType === "review") {
    const receptionPhase = getRawString(event.rawPayload.receptionPhase);

    if (receptionPhase === "late" || hasAnyTerm(text, ["late reception", "grew on me", "aged well", "aged badly"])) {
      return "late_reception";
    }

    if (hasAnyTerm(text, ["critic reaction", "live reaction", "reviewer", "streamer", "fantano", "needle drop"])) {
      return "public_reaction";
    }

    return "review";
  }

  if (event.eventType === "controversy") {
    const socialCatalystKind = getRawString(event.rawPayload.socialCatalystKind);

    if (
      socialCatalystKind === "conflict" ||
      hasAnyTerm(text, ["social conflict", "fight", "fought", "beef", "diss", "pressed", "jumped"])
    ) {
      return "social_conflict";
    }

    return "controversy";
  }

  if (event.eventType === "release") {
    const releaseKind = getRawString(event.rawPayload.releaseKind);

    if (releaseKind && hasAnyTerm(releaseKind, ["album", "ep", "mixtape"])) {
      return "project_release";
    }

    if (releaseKind === "single") {
      return "single_video_release";
    }

    if (hasAnyTerm(text, ["album", "project", "mixtape", "ep", "deluxe", "tracklist"])) {
      return "project_release";
    }

    if (hasAnyTerm(text, ["track audio upload title", "official audio", " audio"])) {
      return "track_audio_release";
    }

    if (hasAnyTerm(text, ["official video", "music video", "visualizer", "single", "song"])) {
      return "single_video_release";
    }

    return "release";
  }

  if (event.eventType === "viral") {
    if (
      hasAnyTerm(text, [
        "carti feature",
        "carti verse",
        "carti cosign",
        "carti co sign",
        "carti co-sign",
        "carti assisted",
        "carti-assisted",
        "drake feature",
        "drake verse",
        "drake cosign",
        "drake co sign",
        "drake co-sign",
        "drake assisted",
        "drake-assisted",
        "feat carti",
        "feat drake",
        "feat future",
        "feat kendrick",
        "feat travis",
        "featuring carti",
        "featuring drake",
        "featuring future",
        "featuring kendrick",
        "featuring travis",
        "ft carti",
        "ft drake",
        "ft future",
        "ft kendrick",
        "ft travis",
        "opium co sign",
        "opium cosign",
        "with carti",
        "with drake",
        "with future",
        "with kendrick",
        "with travis"
      ])
    ) {
      return "major_feature";
    }

    if (
      hasAnyTerm(text, [
        "co sign",
        "cosign",
        "feature",
        "featured",
        "featuring",
        "collab",
        "collaboration",
        "drake feature",
        "guest verse",
        "verse",
        "with drake",
        "with carti",
        "with future",
        "with kendrick",
        "with travis"
      ])
    ) {
      return "feature";
    }

    if (
      hasAnyTerm(text, [
        "crowd knew every word",
        "crowd went crazy",
        "festival",
        "live",
        "mosh pit",
        "moshpit",
        "performance",
        "performed",
        "rolling loud",
        "set went crazy",
        "stage"
      ])
    ) {
      return "performance";
    }

    if (
      hasAnyTerm(text, [
        "hated it",
        "hears",
        "live reaction",
        "listened to",
        "listening to",
        "reacted to",
        "reacting to",
        "reaction",
        "reacts to",
        "reviewer",
        "streamer"
      ])
    ) {
      return "public_reaction";
    }

    if (hasAnyTerm(text, ["chart", "hot 100", "billboard", "streaming record", "number 1", "top 10"])) {
      return "chart";
    }

    if (
      hasAnyTerm(text, [
        "first listen",
        "grail",
        "ig live",
        "snippet",
        "snippets",
        "teaser",
        "preview",
        "previewed",
        "unreleased",
        "leak",
        "leaked"
      ])
    ) {
      return "snippet";
    }

    return "viral";
  }

  if (
    event.eventType === "news" &&
    hasAnyTerm(text, ["tracklist", "cover art", "features list", "features"])
  ) {
    return "tracklist_reaction";
  }

  if (
    event.eventType === "news" &&
    hasAnyTerm(text, [
      "dead crowd",
      "decline",
      "empty crowd",
      "fell off",
      "fall off",
      "fallen off",
      "flop",
      "flopped",
      "lost hype",
      "lost momentum",
      "low sales",
      "numbers down",
      "streams down",
      "underperformed",
      "washed"
    ])
  ) {
    return "decline";
  }

  return event.eventType;
}

function getEventSubtypePriceProfile(subtype: string) {
  const profiles: Record<string, { divisor: number; minShock: number; maxShock: number }> = {
    project_release: { divisor: 1550, minShock: -0.02, maxShock: 0.052 },
    single_video_release: { divisor: 1900, minShock: -0.018, maxShock: 0.035 },
    track_audio_release: { divisor: 3500, minShock: -0.008, maxShock: 0.012 },
    tracklist_reaction: { divisor: 2100, minShock: -0.028, maxShock: 0.024 },
    public_reaction: { divisor: 2150, minShock: -0.032, maxShock: 0.034 },
    status_death: { divisor: 1550, minShock: -0.035, maxShock: 0.055 },
    status_legal_arrest: { divisor: 1750, minShock: -0.045, maxShock: 0.01 },
    status_legal_charge: { divisor: 1700, minShock: -0.048, maxShock: 0.01 },
    status_legal_conviction: { divisor: 1500, minShock: -0.06, maxShock: 0.008 },
    status_legal_sentencing: { divisor: 1425, minShock: -0.07, maxShock: 0.006 },
    status_legal_incarceration: { divisor: 1500, minShock: -0.062, maxShock: 0.008 },
    status_legal_release: { divisor: 1800, minShock: -0.01, maxShock: 0.04 },
    status_hospitalization: { divisor: 1750, minShock: -0.045, maxShock: 0.01 },
    status_injury: { divisor: 2100, minShock: -0.032, maxShock: 0.008 },
    major_feature: { divisor: 1325, minShock: -0.025, maxShock: 0.065 },
    feature: { divisor: 1450, minShock: -0.025, maxShock: 0.055 },
    performance: { divisor: 1550, minShock: -0.034, maxShock: 0.05 },
    chart: { divisor: 1550, minShock: -0.022, maxShock: 0.05 },
    snippet: { divisor: 2350, minShock: -0.015, maxShock: 0.026 },
    social_conflict: { divisor: 1650, minShock: -0.048, maxShock: 0.014 },
    late_reception: { divisor: 1950, minShock: -0.034, maxShock: 0.035 },
    viral: { divisor: 2200, minShock: -0.022, maxShock: 0.034 },
    controversy: { divisor: 1750, minShock: -0.052, maxShock: 0.018 },
    decline: { divisor: 1850, minShock: -0.045, maxShock: 0.012 },
    news: { divisor: 2500, minShock: -0.026, maxShock: 0.024 },
    award: { divisor: 2200, minShock: -0.01, maxShock: 0.03 },
    tour: { divisor: 2600, minShock: -0.01, maxShock: 0.022 }
  };

  return profiles[subtype] ?? { divisor: 2400, minShock: -0.025, maxShock: 0.03 };
}

function normalizeEventText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function hasAnyWholeEventTerm(value: string, terms: string[]) {
  return terms.some((term) => {
    const normalizedTerm = normalizeEventText(term);

    if (!value || !normalizedTerm) {
      return false;
    }

    const pattern = normalizedTerm.split(/\s+/).map(escapeRegExp).join("\\s+");

    return new RegExp(`(^|\\s)${pattern}(?=$|\\s)`).test(value);
  });
}

function getRawString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRawNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getRawOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getRawBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return false;
}

function getRiskFlags(rawPayload: Record<string, unknown>) {
  const value = rawPayload.riskFlags;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => normalizeEventText(item));
}

function hasHighRiskEvidenceFlags(value: MarketEvent | { event: MarketEvent }) {
  const event = "event" in value ? value.event : value;
  const flags = getRiskFlags(event.rawPayload);

  return flags.some((flag) =>
    [
      "sarcasm",
      "joke",
      "meme",
      "fake",
      "hoax",
      "unverified",
      "private",
      "screenshot",
      "troll",
      "parody",
      "satire",
      "copypasta",
      "bot"
    ].some((term) => flag.includes(term))
  );
}

function hasStrongCommunitySignal(event: ScoredMarketEvent) {
  const viralityTier = getRawString(event.event.rawPayload.viralityTier);
  const engagement = getRawOptionalNumber(event.event.rawPayload.engagement) ?? 0;
  const score = getRawOptionalNumber(event.event.rawPayload.score) ?? 0;
  const commentCount = getRawOptionalNumber(event.event.rawPayload.commentCount) ?? 0;

  return (
    viralityTier === "major" ||
    viralityTier === "breakout" ||
    engagement >= 150 ||
    score >= 500 ||
    commentCount >= 120
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getEventDecay(eventType: MarketEvent["eventType"], ageDays: number) {
  const halfLifeDays: Record<MarketEvent["eventType"], number> = {
    release: 18,
    review: 12,
    news: 7,
    controversy: 10,
    award: 14,
    tour: 16,
    viral: 5
  };

  return Math.pow(0.5, ageDays / halfLifeDays[eventType]);
}

function getEventShockDecayMultiplier({
  eventType,
  eventSubtype,
  ageDays
}: {
  eventType: MarketEvent["eventType"];
  eventSubtype: string;
  ageDays: number;
}) {
  const subtypeHalfLives: Record<string, number> = {
    project_release: 4.5,
    single_video_release: 3,
    track_audio_release: 1.5,
    tracklist_reaction: 2.5,
    public_reaction: 2.5,
    social_conflict: 2.8,
    late_reception: 5,
    status_death: 5.5,
    status_legal_arrest: 3.5,
    status_legal_charge: 4,
    status_legal_conviction: 6,
    status_legal_sentencing: 7,
    status_legal_incarceration: 6,
    status_legal_release: 4,
    status_hospitalization: 4,
    status_injury: 3,
    major_feature: 3.5,
    feature: 3,
    performance: 2.5,
    chart: 4,
    snippet: 1.4,
    viral: 2,
    controversy: 2.7,
    decline: 4
  };
  const typeHalfLives: Record<MarketEvent["eventType"], number> = {
    release: 3.5,
    review: 4,
    news: 2.5,
    controversy: 2.7,
    award: 3,
    tour: 3,
    viral: 2
  };
  const halfLife = subtypeHalfLives[eventSubtype] ?? typeHalfLives[eventType];

  if (ageDays > 21) {
    return 0;
  }

  return Math.pow(0.5, ageDays / halfLife);
}

function getEventTypeWeight(eventType: MarketEvent["eventType"]) {
  const weights: Record<MarketEvent["eventType"], number> = {
    release: 1.2,
    review: 1.35,
    news: 0.9,
    controversy: 1.15,
    award: 1.05,
    tour: 0.75,
    viral: 1.1
  };

  return weights[eventType];
}

function getEventClusterCap(eventType: MarketEvent["eventType"]) {
  const caps: Record<MarketEvent["eventType"], number> = {
    release: 120,
    review: 110,
    news: 80,
    controversy: 105,
    award: 75,
    tour: 65,
    viral: 95
  };

  return caps[eventType];
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`).getTime();
  const endDate = new Date(`${end}T00:00:00.000Z`).getTime();

  return Math.round((endDate - startDate) / 86400000);
}

function getFiniteNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function isMarketEventType(value: string): value is MarketEvent["eventType"] {
  return ["release", "review", "news", "controversy", "award", "tour", "viral"].includes(value);
}

function getEventKey(event: MarketEvent) {
  return `${event.artistId}:${event.eventDate}:${getCanonicalEventTitle(event)}`;
}

function dedupeSemanticallyEquivalentEvents(events: MarketEvent[]) {
  const selected = new Map<string, MarketEvent>();

  for (const event of events) {
    const key = getEventKey(event);
    const existing = selected.get(key);

    if (!existing || getEventEvidencePreference(event) > getEventEvidencePreference(existing)) {
      selected.set(key, event);
    }
  }

  return [...selected.values()];
}

function getEventEvidencePreference(event: MarketEvent) {
  const artistRole = getRawString(event.rawPayload.artistRole);
  const evidenceLevel = getRawString(event.rawPayload.evidenceLevel);
  const sourceTier = getRawOptionalNumber(event.rawPayload.sourceTier) ?? 0;
  const corroboratingSourceCount = getRawOptionalNumber(event.rawPayload.corroboratingSourceCount) ?? 1;
  const roleScore = artistRole === "featured" ? 80 : artistRole === "subject" ? 24 : artistRole === "mentioned" ? -80 : 0;
  const evidenceScore = evidenceLevel === "verified" ? 18 : evidenceLevel === "reported" ? 9 : evidenceLevel === "rumor" ? -30 : 0;

  return (
    roleScore +
    evidenceScore +
    sourceTier * 7 +
    corroboratingSourceCount * 5 +
    event.confidence * 24 +
    Math.abs(event.impactScore) * 0.12
  );
}

function getCanonicalEventTitle(event: MarketEvent) {
  let title = normalizeEventText(event.title);
  const sourceName = event.sourceName ? normalizeEventText(event.sourceName) : "";

  if (sourceName && title.endsWith(` ${sourceName}`)) {
    title = title.slice(0, -sourceName.length).trim();
  }

  return title.replace(/\s+(?:fm|radio|com|net|org)$/i, "").trim();
}
