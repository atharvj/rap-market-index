import { getDailyChangePercent, roundPrice } from "@/lib/pricing";
import type { ArtistMarketUpdate, MarketUpdateArtist } from "@/server/market/daily-update";
import type { AudienceScaleCalibration } from "@/server/market/audience-scale";

export type AudienceRevaluation = {
  version: 2;
  effectiveDate: string;
  effectiveAt?: string;
  referencePrice: number;
  anchorPrice: number;
  factor: number;
  calibration: AudienceScaleCalibration;
};

export function readAudienceRevaluation(value: unknown, runDate: string): AudienceRevaluation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as AudienceRevaluation;
  if (record.version !== 2 || record.effectiveDate !== runDate) return null;
  if (record.effectiveAt !== undefined && !Number.isFinite(Date.parse(record.effectiveAt))) return null;
  if (![record.referencePrice, record.anchorPrice, record.factor].every(number => Number.isFinite(number) && number > 0)) return null;
  if (Math.abs(record.factor - record.anchorPrice / record.referencePrice) > 0.000001) return null;
  return record;
}

export function createAudienceRevaluation(artist: MarketUpdateArtist, calibration: AudienceScaleCalibration, runDate: string): AudienceRevaluation {
  if (calibration.version !== 2 || calibration.status !== "ok" || !calibration.targetPrice || calibration.directSourceCount < 2 || !calibration.metrics.some(metric => metric.key === "spotify_monthly_listeners")) {
    throw new Error(`Audience repricing requires fresh evidence from at least two platforms for ${artist.ticker}.`);
  }
  if (artist.baselineOnly || !Number.isFinite(artist.previousClose) || artist.previousClose <= 0) {
    throw new Error(`Audience repricing requires an existing recorded close for ${artist.ticker}.`);
  }
  return {
    version: 2, effectiveDate: runDate, referencePrice: artist.previousClose,
    anchorPrice: calibration.targetPrice, factor: calibration.targetPrice / artist.previousClose, calibration
  };
}

/** Calculate in the original session's units, then translate once at the end.
 * Saved same-day boundaries survive daily reruns, intraday refreshes and trades.
 * On later dates the recorded corrected close becomes the ordinary baseline. */
export function prepareRevaluedArtist(artist: MarketUpdateArtist, record?: AudienceRevaluation): MarketUpdateArtist {
  if (!record) return artist;
  return {
    ...artist, currentPrice: record.referencePrice, previousClose: record.referencePrice,
    quotedPrice: artist.quotedPrice === undefined ? undefined : artist.quotedPrice / record.factor
  };
}

export function applyAudienceRevaluation(update: ArtistMarketUpdate, record?: AudienceRevaluation): ArtistMarketUpdate {
  if (!record) return update;
  const currentPrice = roundPrice(update.currentPrice * record.factor);
  return {
    ...update, currentPrice,
    dailyChangePercent: getDailyChangePercent(currentPrice, record.referencePrice),
    explanation: `${update.ticker} was recalibrated using the shared Spotify, Last.fm and YouTube audience valuation. Today's change includes this model correction.`,
    rawPayload: { ...update.rawPayload, audienceRevaluation: record, priceBeforeRevaluation: update.currentPrice }
  };
}

export function priceForTrendAnalysis(price: number, priceDate: string, records: AudienceRevaluation[]) {
  return records.reduce((adjusted, record) => priceDate < record.effectiveDate ? adjusted * record.factor : adjusted, price);
}
