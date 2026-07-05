import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { requireAdminRequest } from "@/server/admin-auth";
import { DEFAULT_MARKET_MODEL_VERSION, getMarketModelVersion } from "@/server/market/model-version";
import { loadActiveArtists, loadArtistExternalIds } from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";

type ObservationRow = Pick<
  Database["public"]["Tables"]["market_observations"]["Row"],
  "artist_id" | "source" | "metric" | "observed_date"
>;

type PriceHistoryRow = Pick<Database["public"]["Tables"]["price_history"]["Row"], "artist_id" | "price_date">;
type PriceTickRow = Pick<
  Database["public"]["Tables"]["price_ticks"]["Row"],
  "artist_id" | "observed_at" | "source"
>;

type MarketEventRow = Pick<
  Database["public"]["Tables"]["market_events"]["Row"],
  "artist_id" | "event_date" | "event_type"
>;

type MarketRunRow = Database["public"]["Tables"]["market_update_runs"]["Row"];

type SourceCoverage = {
  key: string;
  label: string;
  configuredCount: number;
  missingCount: number;
  coveragePercent: number;
  warningThreshold: number | null;
};

type ObservationHealth = {
  key: string;
  label: string;
  source: string;
  metric: string;
  warningThreshold: number | null;
  latestDate: string | null;
  observedArtistCount: number;
  freshArtistCount: number;
  staleArtistCount: number;
  missingArtistCount: number;
  freshCoveragePercent: number;
};

type EventHealth = {
  latestDate: string | null;
  eventCount: number;
  freshEventCount: number;
  observedArtistCount: number;
  freshArtistCount: number;
  missingArtistCount: number;
  freshCoveragePercent: number;
  eventFreshnessDays: number;
  typeCounts: Record<string, number>;
  freshTypeCounts: Record<string, number>;
};

type PriceTickHealth = {
  latestAt: string | null;
  tickCount: number;
  marketRunTickCount: number;
  tradeTickCount: number;
  migrationTickCount: number;
  manualTickCount: number;
  observedArtistCount: number;
  freshArtistCount: number;
  staleArtistCount: number;
  missingArtistCount: number;
  freshCoveragePercent: number;
};

const SOURCE_ID_FIELDS = [
  { key: "lastfmName", label: "Audience search names", warningThreshold: 80 },
  { key: "gdeltQuery", label: "News search queries", warningThreshold: 80 },
  { key: "spotifyId", label: "Spotify exact IDs", warningThreshold: null },
  { key: "youtubeChannelId", label: "YouTube exact IDs", warningThreshold: null },
  { key: "musicbrainzId", label: "Release database IDs", warningThreshold: null }
] as const;

const OBSERVATION_SERIES = [
  { source: "lastfm", metric: "listeners", label: "Audience listeners", warningThreshold: 80 },
  { source: "lastfm", metric: "playcount", label: "Audience plays", warningThreshold: 80 },
  { source: "wikimedia", metric: "pageviews_7d", label: "Public attention 7-day views", warningThreshold: null },
  { source: "wikimedia", metric: "pageviews_1d", label: "Public attention 1-day views", warningThreshold: null },
  { source: "youtube", metric: "channel_views", label: "Video views", warningThreshold: null },
  { source: "youtube", metric: "subscriber_count", label: "Video subscribers", warningThreshold: null },
  { source: "youtube_uploads", metric: "recent_video_count", label: "Recent official uploads", warningThreshold: null },
  { source: "youtube_uploads", metric: "event_video_count", label: "Upload event matches", warningThreshold: null },
  { source: "spotify", metric: "popularity", label: "Spotify popularity", warningThreshold: null },
  { source: "spotify", metric: "followers_total", label: "Spotify followers", warningThreshold: null },
  { source: "youtube_comments", metric: "comment_sentiment", label: "Comment sentiment", warningThreshold: null },
  { source: "youtube_comments", metric: "comment_count", label: "Comments sampled", warningThreshold: null },
  { source: "gdelt", metric: "article_count", label: "News article count", warningThreshold: null },
  { source: "reddit", metric: "post_count", label: "Community post count", warningThreshold: null },
  { source: "reddit", metric: "engagement_score", label: "Community engagement", warningThreshold: null },
  { source: "reddit", metric: "hype_post_count", label: "Community hype posts", warningThreshold: null },
  { source: "reddit", metric: "negative_post_count", label: "Community negative posts", warningThreshold: null },
  { source: "reddit", metric: "catalyst_post_count", label: "Community catalyst posts", warningThreshold: null },
  { source: "trade_flow", metric: "net_order_value", label: "Trade-flow net order value", warningThreshold: null },
  { source: "trade_flow", metric: "trade_count", label: "Trade-flow trades", warningThreshold: null },
  { source: "trade_flow", metric: "unique_trader_count", label: "Trade-flow traders", warningThreshold: null }
] as const;

const MAX_OBSERVATION_ROWS = 20000;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not fully configured.",
        config
      },
      { status: 400 }
    );
  }

  try {
    const url = new URL(request.url);
    const runDate = url.searchParams.get("runDate") ?? getToday();
    const lookbackDays = getInteger(url.searchParams.get("lookbackDays"), 30, 1, 180);
    const freshnessDays = getInteger(url.searchParams.get("freshnessDays"), 2, 0, 30);
    const configuredModelVersion = getMarketModelVersion();
    const supabase = createServiceRoleClient();
    const artists = await loadActiveArtists(supabase);
    const artistIds = artists.map((artist) => artist.id);
    const eventFreshnessDays = Math.max(7, freshnessDays);
    const [externalIds, recentRuns, observations, priceHistory, priceTicks, recentEvents] = await Promise.all([
      loadArtistExternalIds(supabase, artistIds),
      loadRecentMarketRuns(supabase),
      loadRecentObservations({
        supabase,
        artistIds,
        runDate,
        lookbackDays
      }),
      loadRecentPriceHistory({
        supabase,
        artistIds,
        runDate,
        lookbackDays
      }),
      loadRecentPriceTicks({
        supabase,
        artistIds,
        runDate,
        lookbackDays
      }),
      loadRecentEvents({
        supabase,
        artistIds,
        runDate,
        lookbackDays
      })
    ]);
    const sourceCoverage = buildSourceCoverage({
      activeArtistCount: artists.length,
      externalIds
    });
    const observationHealth = buildObservationHealth({
      activeArtistCount: artists.length,
      observations,
      runDate,
      freshnessDays
    });
    const priceHistoryHealth = buildPriceHistoryHealth({
      activeArtistCount: artists.length,
      priceHistory,
      runDate,
      freshnessDays
    });
    const priceTickHealth = buildPriceTickHealth({
      activeArtistCount: artists.length,
      priceTicks,
      runDate,
      freshnessDays
    });
    const eventHealth = buildEventHealth({
      activeArtistCount: artists.length,
      events: recentEvents,
      runDate,
      eventFreshnessDays
    });
    const warnings = buildWarnings({
      config,
      recentRuns,
      sourceCoverage,
      observationHealth,
      priceHistoryHealth,
      priceTickHealth,
      eventHealth,
      configuredModelVersion,
      defaultModelVersion: DEFAULT_MARKET_MODEL_VERSION,
      observationRowsTruncated: observations.length >= MAX_OBSERVATION_ROWS
    });

    return NextResponse.json({
      ok: true,
      config,
      runDate,
      lookbackDays,
      freshnessDays,
      configuredModelVersion,
      defaultModelVersion: DEFAULT_MARKET_MODEL_VERSION,
      latestModelVersion: recentRuns[0]?.model_version ?? null,
      activeArtistCount: artists.length,
      sourceCoverage,
      observationHealth,
      priceHistoryHealth,
      priceTickHealth,
      eventHealth,
      latestRun: recentRuns[0] ?? null,
      recentRuns,
      warnings
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatMarketHealthError(error),
        config
      },
      { status: 500 }
    );
  }
}

async function loadRecentMarketRuns(supabase: ReturnType<typeof createServiceRoleClient>) {
  const { data, error } = await supabase
    .from("market_update_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(8);

  if (error) {
    throw new Error(`Could not load market update runs: ${error.message}`);
  }

  return (data ?? []) as MarketRunRow[];
}

async function loadRecentObservations({
  supabase,
  artistIds,
  runDate,
  lookbackDays
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistIds: string[];
  runDate: string;
  lookbackDays: number;
}) {
  if (!artistIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("market_observations")
    .select("artist_id, source, metric, observed_date")
    .in("artist_id", artistIds)
    .in("source", Array.from(new Set(OBSERVATION_SERIES.map((series) => series.source))))
    .in("metric", Array.from(new Set(OBSERVATION_SERIES.map((series) => series.metric))))
    .gte("observed_date", shiftDate(runDate, -lookbackDays))
    .lte("observed_date", runDate)
    .order("observed_date", { ascending: false })
    .limit(MAX_OBSERVATION_ROWS);

  if (error) {
    throw new Error(`Could not load market observations: ${error.message}`);
  }

  return ((data ?? []) as ObservationRow[]).filter((row) =>
    OBSERVATION_SERIES.some((series) => series.source === row.source && series.metric === row.metric)
  );
}

async function loadRecentPriceHistory({
  supabase,
  artistIds,
  runDate,
  lookbackDays
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistIds: string[];
  runDate: string;
  lookbackDays: number;
}) {
  if (!artistIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("price_history")
    .select("artist_id, price_date")
    .in("artist_id", artistIds)
    .gte("price_date", shiftDate(runDate, -lookbackDays))
    .lte("price_date", runDate)
    .order("price_date", { ascending: false })
    .limit(MAX_OBSERVATION_ROWS);

  if (error) {
    throw new Error(`Could not load price history health: ${error.message}`);
  }

  return (data ?? []) as PriceHistoryRow[];
}

async function loadRecentPriceTicks({
  supabase,
  artistIds,
  runDate,
  lookbackDays
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistIds: string[];
  runDate: string;
  lookbackDays: number;
}) {
  if (!artistIds.length) {
    return [];
  }

  const startDate = shiftDate(runDate, -lookbackDays);
  const endDate = shiftDate(runDate, 1);
  const { data, error } = await supabase
    .from("price_ticks")
    .select("artist_id, observed_at, source")
    .in("artist_id", artistIds)
    .gte("observed_at", `${startDate}T00:00:00.000Z`)
    .lt("observed_at", `${endDate}T00:00:00.000Z`)
    .order("observed_at", { ascending: false })
    .limit(MAX_OBSERVATION_ROWS);

  if (error) {
    throw new Error(`Could not load price tick health: ${error.message}`);
  }

  return (data ?? []) as PriceTickRow[];
}

async function loadRecentEvents({
  supabase,
  artistIds,
  runDate,
  lookbackDays
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistIds: string[];
  runDate: string;
  lookbackDays: number;
}) {
  if (!artistIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("market_events")
    .select("artist_id,event_date,event_type")
    .in("artist_id", artistIds)
    .gte("event_date", shiftDate(runDate, -lookbackDays))
    .lte("event_date", runDate)
    .order("event_date", { ascending: false })
    .limit(MAX_OBSERVATION_ROWS);

  if (error) {
    throw new Error(`Could not load market event health: ${error.message}`);
  }

  return (data ?? []) as MarketEventRow[];
}

function buildSourceCoverage({
  activeArtistCount,
  externalIds
}: {
  activeArtistCount: number;
  externalIds: Awaited<ReturnType<typeof loadArtistExternalIds>>;
}): SourceCoverage[] {
  return SOURCE_ID_FIELDS.map((field) => {
    const configuredCount = Object.values(externalIds).filter((ids) => Boolean(ids[field.key])).length;

    return {
      key: field.key,
      label: field.label,
      configuredCount,
      missingCount: Math.max(0, activeArtistCount - configuredCount),
      coveragePercent: getPercent(configuredCount, activeArtistCount),
      warningThreshold: field.warningThreshold
    };
  });
}

function buildObservationHealth({
  activeArtistCount,
  observations,
  runDate,
  freshnessDays
}: {
  activeArtistCount: number;
  observations: ObservationRow[];
  runDate: string;
  freshnessDays: number;
}): ObservationHealth[] {
  const freshDate = shiftDate(runDate, -freshnessDays);

  return OBSERVATION_SERIES.map((series) => {
    const latestByArtist = new Map<string, string>();

    for (const row of observations) {
      if (row.source !== series.source || row.metric !== series.metric) {
        continue;
      }

      const current = latestByArtist.get(row.artist_id);

      if (!current || row.observed_date > current) {
        latestByArtist.set(row.artist_id, row.observed_date);
      }
    }

    const latestDates = Array.from(latestByArtist.values());
    const freshArtistCount = latestDates.filter((date) => date >= freshDate).length;
    const observedArtistCount = latestByArtist.size;

    return {
      key: `${series.source}:${series.metric}`,
      label: series.label,
      source: series.source,
      metric: series.metric,
      warningThreshold: series.warningThreshold,
      latestDate: latestDates.sort().at(-1) ?? null,
      observedArtistCount,
      freshArtistCount,
      staleArtistCount: Math.max(0, observedArtistCount - freshArtistCount),
      missingArtistCount: Math.max(0, activeArtistCount - observedArtistCount),
      freshCoveragePercent: getPercent(freshArtistCount, activeArtistCount)
    };
  });
}

function buildPriceHistoryHealth({
  activeArtistCount,
  priceHistory,
  runDate,
  freshnessDays
}: {
  activeArtistCount: number;
  priceHistory: PriceHistoryRow[];
  runDate: string;
  freshnessDays: number;
}) {
  const freshDate = shiftDate(runDate, -freshnessDays);
  const latestByArtist = new Map<string, string>();

  for (const row of priceHistory) {
    const current = latestByArtist.get(row.artist_id);

    if (!current || row.price_date > current) {
      latestByArtist.set(row.artist_id, row.price_date);
    }
  }

  const dates = Array.from(latestByArtist.values());
  const freshArtistCount = dates.filter((date) => date >= freshDate).length;

  return {
    latestDate: dates.sort().at(-1) ?? null,
    observedArtistCount: latestByArtist.size,
    freshArtistCount,
    staleArtistCount: Math.max(0, latestByArtist.size - freshArtistCount),
    missingArtistCount: Math.max(0, activeArtistCount - latestByArtist.size),
    freshCoveragePercent: getPercent(freshArtistCount, activeArtistCount)
  };
}

function buildPriceTickHealth({
  activeArtistCount,
  priceTicks,
  runDate,
  freshnessDays
}: {
  activeArtistCount: number;
  priceTicks: PriceTickRow[];
  runDate: string;
  freshnessDays: number;
}): PriceTickHealth {
  const freshAt = `${shiftDate(runDate, -freshnessDays)}T00:00:00.000Z`;
  const latestByArtist = new Map<string, string>();

  for (const tick of priceTicks) {
    const current = latestByArtist.get(tick.artist_id);

    if (!current || tick.observed_at > current) {
      latestByArtist.set(tick.artist_id, tick.observed_at);
    }
  }

  const timestamps = Array.from(latestByArtist.values());
  const freshArtistCount = timestamps.filter((observedAt) => observedAt >= freshAt).length;

  return {
    latestAt: priceTicks.map((tick) => tick.observed_at).sort().at(-1) ?? null,
    tickCount: priceTicks.length,
    marketRunTickCount: priceTicks.filter((tick) => tick.source === "market_run").length,
    tradeTickCount: priceTicks.filter((tick) => tick.source === "trade").length,
    migrationTickCount: priceTicks.filter((tick) => tick.source === "migration").length,
    manualTickCount: priceTicks.filter((tick) => tick.source === "manual").length,
    observedArtistCount: latestByArtist.size,
    freshArtistCount,
    staleArtistCount: Math.max(0, latestByArtist.size - freshArtistCount),
    missingArtistCount: Math.max(0, activeArtistCount - latestByArtist.size),
    freshCoveragePercent: getPercent(freshArtistCount, activeArtistCount)
  };
}

function buildEventHealth({
  activeArtistCount,
  events,
  runDate,
  eventFreshnessDays
}: {
  activeArtistCount: number;
  events: MarketEventRow[];
  runDate: string;
  eventFreshnessDays: number;
}): EventHealth {
  const freshDate = shiftDate(runDate, -eventFreshnessDays);
  const latestByArtist = new Map<string, string>();
  const freshArtistIds = new Set<string>();
  const typeCounts: Record<string, number> = {};
  const freshTypeCounts: Record<string, number> = {};
  let freshEventCount = 0;

  for (const event of events) {
    const current = latestByArtist.get(event.artist_id);
    const isFresh = event.event_date >= freshDate;

    if (!current || event.event_date > current) {
      latestByArtist.set(event.artist_id, event.event_date);
    }

    if (isFresh) {
      freshEventCount += 1;
      freshArtistIds.add(event.artist_id);
      freshTypeCounts[event.event_type] = (freshTypeCounts[event.event_type] ?? 0) + 1;
    }

    typeCounts[event.event_type] = (typeCounts[event.event_type] ?? 0) + 1;
  }

  const dates = Array.from(latestByArtist.values());

  return {
    latestDate: dates.sort().at(-1) ?? null,
    eventCount: events.length,
    freshEventCount,
    observedArtistCount: latestByArtist.size,
    freshArtistCount: freshArtistIds.size,
    missingArtistCount: Math.max(0, activeArtistCount - latestByArtist.size),
    freshCoveragePercent: getPercent(freshArtistIds.size, activeArtistCount),
    eventFreshnessDays,
    typeCounts,
    freshTypeCounts
  };
}

function buildWarnings({
  config,
  recentRuns,
  sourceCoverage,
  observationHealth,
  priceHistoryHealth,
  priceTickHealth,
  eventHealth,
  configuredModelVersion,
  defaultModelVersion,
  observationRowsTruncated
}: {
  config: ReturnType<typeof getSupabaseConfigStatus>;
  recentRuns: MarketRunRow[];
  sourceCoverage: SourceCoverage[];
  observationHealth: ObservationHealth[];
  priceHistoryHealth: ReturnType<typeof buildPriceHistoryHealth>;
  priceTickHealth: PriceTickHealth;
  eventHealth: EventHealth;
  configuredModelVersion: string;
  defaultModelVersion: string;
  observationRowsTruncated: boolean;
}) {
  const warnings: string[] = [];
  const latestSucceededRun = recentRuns.find((run) => run.status === "succeeded");

  if (!latestSucceededRun) {
    warnings.push("No successful market update run is recorded yet.");
  } else if (!latestSucceededRun.model_version) {
    warnings.push("Latest successful market run has no model version metadata. Run migration 008_market_model_version.sql.");
  } else if (latestSucceededRun.model_version !== configuredModelVersion) {
    warnings.push(
      `Latest successful market run used ${latestSucceededRun.model_version}; configured model is ${configuredModelVersion}.`
    );
  }

  if (!config.cronSecretConfigured) {
    warnings.push("CRON_SECRET is missing, so scheduled production market updates are not ready.");
  }

  if (configuredModelVersion !== defaultModelVersion) {
    warnings.push(
      `MARKET_MODEL_VERSION overrides the code default ${defaultModelVersion} with ${configuredModelVersion}.`
    );
  }

  for (const coverage of sourceCoverage) {
    if (coverage.warningThreshold !== null && coverage.coveragePercent < coverage.warningThreshold) {
      warnings.push(`${coverage.label} coverage is ${coverage.coveragePercent.toFixed(1)}%.`);
    }
  }

  for (const health of observationHealth) {
    if (health.warningThreshold !== null && health.freshCoveragePercent < health.warningThreshold) {
      warnings.push(`${health.label} fresh coverage is ${health.freshCoveragePercent.toFixed(1)}%.`);
    }
  }

  if (priceHistoryHealth.freshCoveragePercent < 80 && priceHistoryHealth.observedArtistCount > 0) {
    warnings.push(`Fresh price history coverage is ${priceHistoryHealth.freshCoveragePercent.toFixed(1)}%.`);
  }

  if (priceTickHealth.tickCount === 0) {
    warnings.push("No price ticks are recorded yet, so intraday artist charts will fall back to daily history.");
  } else if (priceTickHealth.marketRunTickCount === 0 && priceTickHealth.tradeTickCount === 0) {
    warnings.push("Price ticks currently only contain seed/manual rows; run the market engine or record trades to start live quote ticks.");
  } else if (priceTickHealth.freshCoveragePercent < 80) {
    warnings.push(`Fresh quote tick coverage is ${priceTickHealth.freshCoveragePercent.toFixed(1)}%.`);
  }

  if (eventHealth.eventCount === 0) {
    warnings.push("No recent market events are recorded, so release/news/review modifiers are idle.");
  }

  if (observationRowsTruncated) {
    warnings.push("Observation health reached the row cap; add an aggregate SQL view before scaling much further.");
  }

  return warnings;
}

function getInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function getPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return (numerator / denominator) * 100;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function formatMarketHealthError(error: unknown) {
  const message = error instanceof Error ? error.message : "Market health request failed.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("market_observations") ||
    normalized.includes("artist_external_ids") ||
    normalized.includes("market_update_runs") ||
    normalized.includes("market_events") ||
    normalized.includes("price_history") ||
    normalized.includes("price_ticks") ||
    normalized.includes("model_version") ||
    normalized.includes("schema cache")
  ) {
    return "Market engine storage needs setup. Run the Supabase migrations through 013_price_ticks.sql.";
  }

  return message;
}
