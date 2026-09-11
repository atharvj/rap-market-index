import { clamp } from "@/lib/pricing";
import type { AdapterSignal, AdapterSignals } from "@/server/market/market-data";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

import { calculateAudienceValuation } from "@/lib/audience-valuation";

export type AudienceScaleCalibration = ReturnType<typeof calculateAudienceValuation>;

export type AudienceScaleSnapshots = Record<
  string,
  {
    spotify?: { monthlyListeners?: number };
    lastfm?: { listeners?: number; playcount?: number };
    youtube?: { subscriberCount?: number; viewCount?: number };
    wikimedia?: { pageviews7d?: number };
  }
>;

/**
 * Adds a slow-moving valuation anchor without turning audience size into a
 * momentum signal. Daily growth and verified events still control daily moves.
 */
export function attachAudienceScaleCalibration({
  artists,
  signals,
  snapshots = {}
}: {
  artists: MarketUpdateArtist[];
  signals: AdapterSignals;
  snapshots?: AudienceScaleSnapshots;
}): AdapterSignals {
  return Object.fromEntries(
    artists.map((artist) => {
      const signal = signals[artist.id] ?? { stats: {}, rawPayload: {} };
      const calibration = buildAudienceScaleCalibration(signal, snapshots[artist.id]);

      return [
        artist.id,
        {
          ...signal,
          rawPayload: {
            ...signal.rawPayload,
            audienceScaleCalibration: calibration
          }
        } satisfies AdapterSignal
      ];
    })
  );
}

export function buildAudienceScaleCalibration(
  signal: AdapterSignal,
  snapshot?: AudienceScaleSnapshots[string]
): AudienceScaleCalibration {
  const spotify = getRecord(signal.rawPayload.spotify_public);
  const lastfm = getRecord(signal.rawPayload.lastfm);
  const youtube = getRecord(signal.rawPayload.youtube);
  const viewFlags = getRecord(youtube.viewMomentumQuality).anomalyFlags;
  const quarantinedViews = Array.isArray(viewFlags) && viewFlags.includes("implausible_counter_restatement");
  return calculateAudienceValuation({
    monthlyListeners: getPositiveNumber(spotify.monthlyListeners) ?? snapshot?.spotify?.monthlyListeners,
    lastfmListeners: getPositiveNumber(lastfm.listeners) ?? snapshot?.lastfm?.listeners,
    lastfmPlays: getPositiveNumber(lastfm.playcount) ?? snapshot?.lastfm?.playcount,
    youtubeSubscribers: getPositiveNumber(youtube.subscriberCount) ?? snapshot?.youtube?.subscriberCount,
    youtubeViews: quarantinedViews ? snapshot?.youtube?.viewCount : getPositiveNumber(youtube.viewCount) ?? snapshot?.youtube?.viewCount
  });
}

export function getAudienceScaleAdjustment(rawPayload: Record<string, unknown>, currentPrice: number) {
  const calibration = getRecord(rawPayload.audienceScaleCalibration);
  const targetPrice = getPositiveNumber(calibration.targetPrice);
  const coverage = getFiniteNumber(calibration.coverage) ?? 0;
  const confidence = clamp(
    getFiniteNumber(calibration.confidence) ?? (0.35 + coverage * 0.55),
    0.25,
    0.9
  );
  if (!targetPrice || currentPrice <= 0 || calibration.status !== "ok") {
    return {
      adjustment: 0,
      targetPrice: null,
      coverage,
      gapPercent: 0
    };
  }

  return {
    // Audience size establishes the opening quote in the prelaunch/listing flow.
    // Reapplying the same level gap as a daily catalyst creates a mechanical
    // incline or decline even when the underlying audience is changing. Keep the
    // calibration here for valuation diagnostics, but let post-listing quotes be
    // driven by measured momentum, events, trading, and technical context.
    adjustment: 0,
    targetPrice,
    coverage,
    confidence,
    gapPercent: round(((targetPrice - currentPrice) / currentPrice) * 100),
    application: "listing_anchor_only"
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPositiveNumber(value: unknown) {
  const number = getFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
