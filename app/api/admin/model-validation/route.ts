import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import { getMarketDate, shiftMarketDate } from "@/server/market/market-date";
import {
  evaluateMarketModel,
  type ValidationAudienceObservation,
  type ValidationSignalSnapshot
} from "@/server/market/model-validation";
import { loadActiveArtists } from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";

const VALIDATION_SERIES = [
  { source: "lastfm", metric: "listeners" },
  { source: "lastfm", metric: "playcount" },
  { source: "listenbrainz", metric: "listener_count" },
  { source: "listenbrainz", metric: "listen_count" },
  { source: "youtube", metric: "channel_views" },
  { source: "youtube", metric: "subscriber_count" },
  { source: "wikimedia", metric: "pageviews_7d" }
] as const;

const PAGE_SIZE = 1000;
const MAX_ROWS = 30000;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json({ ok: false, error: "Supabase admin credentials are not fully configured." }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const runDate = normalizeDate(url.searchParams.get("runDate")) ?? getMarketDate();
    const horizonDays = getInteger(url.searchParams.get("horizonDays"), 7, 3, 30);
    const lookbackDays = getInteger(url.searchParams.get("lookbackDays"), 60, 21, 180);
    const supabase = createServiceRoleClient();
    const artists = await loadActiveArtists(supabase);
    const artistIds = artists.map((artist) => artist.id);
    const signalStartDate = shiftMarketDate(runDate, -lookbackDays);
    const signalEndDate = shiftMarketDate(runDate, -horizonDays - 2);
    const observationStartDate = shiftMarketDate(signalStartDate, -horizonDays - 2);
    const [snapshots, observations] = await Promise.all([
      loadSignalSnapshots({ supabase, artistIds, startDate: signalStartDate, endDate: signalEndDate }),
      loadAudienceObservations({ supabase, artistIds, startDate: observationStartDate, endDate: runDate })
    ]);
    const validation = evaluateMarketModel({ snapshots, observations, horizonDays });

    return NextResponse.json({
      ok: true,
      runDate,
      lookbackDays,
      signalWindow: { startDate: signalStartDate, endDate: signalEndDate },
      snapshotRowCount: snapshots.length,
      observationRowCount: observations.length,
      validation
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not validate the market model." },
      { status: 500 }
    );
  }
}

async function loadSignalSnapshots({
  supabase,
  artistIds,
  startDate,
  endDate
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistIds: string[];
  startDate: string;
  endDate: string;
}) {
  if (!artistIds.length || endDate < startDate) {
    return [];
  }

  const rows = await loadPagedRows(async (from, to) => {
    const { data, error } = await supabase
      .from("market_signal_snapshots")
      .select("artist_id,source_date,streaming_growth,youtube_growth,search_growth,social_growth,news_score,trader_demand")
      .in("artist_id", artistIds)
      .gte("source_date", startDate)
      .lte("source_date", endDate)
      .order("source_date", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Could not load model validation snapshots: ${error.message}`);
    }

    return data ?? [];
  });

  return rows.map<ValidationSignalSnapshot>((row) => ({
    artistId: row.artist_id,
    sourceDate: row.source_date,
    streamingGrowth: Number(row.streaming_growth),
    youtubeGrowth: Number(row.youtube_growth),
    searchGrowth: Number(row.search_growth),
    socialGrowth: Number(row.social_growth),
    newsScore: Number(row.news_score),
    traderDemand: Number(row.trader_demand)
  }));
}

async function loadAudienceObservations({
  supabase,
  artistIds,
  startDate,
  endDate
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistIds: string[];
  startDate: string;
  endDate: string;
}) {
  if (!artistIds.length) {
    return [];
  }

  const sourceNames = Array.from(new Set(VALIDATION_SERIES.map((series) => series.source)));
  const metricNames = Array.from(new Set(VALIDATION_SERIES.map((series) => series.metric)));
  const rows = await loadPagedRows(async (from, to) => {
    const { data, error } = await supabase
      .from("market_observations")
      .select("artist_id,source,metric,observed_date,value")
      .in("artist_id", artistIds)
      .in("source", sourceNames)
      .in("metric", metricNames)
      .gte("observed_date", startDate)
      .lte("observed_date", endDate)
      .order("observed_date", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Could not load model validation outcomes: ${error.message}`);
    }

    return (data ?? []).filter((row) =>
      VALIDATION_SERIES.some((series) => series.source === row.source && series.metric === row.metric)
    );
  });

  return rows.map<ValidationAudienceObservation>((row) => ({
    artistId: row.artist_id,
    source: row.source,
    metric: row.metric,
    observedDate: row.observed_date,
    value: Number(row.value)
  }));
}

async function loadPagedRows<T>(loadPage: (from: number, to: number) => Promise<T[]>) {
  const rows: T[] = [];

  while (rows.length < MAX_ROWS) {
    const page = await loadPage(rows.length, Math.min(rows.length + PAGE_SIZE - 1, MAX_ROWS - 1));
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

function normalizeDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function getInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
