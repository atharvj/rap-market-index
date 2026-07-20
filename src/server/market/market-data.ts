import type { HypeStats } from "@/lib/types";

export type ArtistExternalIds = {
  artistId: string;
  spotifyId?: string;
  youtubeChannelId?: string;
  musicbrainzId?: string;
  wikipediaArticleTitle?: string;
  lastfmName?: string;
  gdeltQuery?: string;
};

export type MarketObservation = {
  artistId: string;
  source: string;
  metric: string;
  observedDate: string;
  observedAt?: string;
  value: number;
  unit: string;
  rawPayload: Record<string, unknown>;
};

export type ObservationBaselines = Record<string, Record<string, number>>;

export type MarketEventType = "release" | "review" | "news" | "controversy" | "award" | "tour" | "viral";

export type MarketEvent = {
  id?: string;
  artistId: string;
  eventDate: string;
  eventType: MarketEventType;
  title: string;
  sourceName?: string;
  sourceUrl?: string;
  sentimentScore: number;
  impactScore: number;
  confidence: number;
  rawPayload: Record<string, unknown>;
};

export type MarketSignalModifier = {
  reason: string;
  priceMultiplier?: number;
  priceShock?: number;
  score?: number;
  reasonPriority?: number;
};

export type AdapterSignal = {
  stats: Partial<HypeStats>;
  rawPayload: Record<string, unknown>;
  modifiers?: MarketSignalModifier[];
  confidence?: number;
};

export type AdapterSignals = Record<string, AdapterSignal>;
