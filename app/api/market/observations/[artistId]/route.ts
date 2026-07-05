import { NextResponse } from "next/server";
import { createAnonServerClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { MarketObservationSeries } from "@/lib/types";

export const dynamic = "force-dynamic";

type ObservationRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

type ObservationRow = Pick<
  Database["public"]["Tables"]["market_observations"]["Row"],
  "source" | "metric" | "observed_date" | "value" | "unit"
>;

const RANGE_DAYS: Record<Exclude<ObservationRange, "ALL">, number> = {
  "1M": 31,
  "3M": 93,
  "6M": 186,
  "1Y": 365
};

const SERIES_DEFINITIONS: Record<string, { label: string; unit: string }> = {
  "lastfm:listeners": {
    label: "Last.fm listeners",
    unit: "listeners"
  },
  "lastfm:playcount": {
    label: "Last.fm plays",
    unit: "plays"
  },
  "spotify:popularity": {
    label: "Spotify popularity",
    unit: "score"
  },
  "spotify:followers_total": {
    label: "Spotify followers",
    unit: "followers"
  },
  "youtube:channel_views": {
    label: "YouTube views",
    unit: "views"
  },
  "youtube:subscriber_count": {
    label: "YouTube subscribers",
    unit: "subscribers"
  },
  "youtube:video_count": {
    label: "YouTube videos",
    unit: "videos"
  },
  "youtube_comments:comment_sentiment": {
    label: "YouTube comment sentiment",
    unit: "score"
  },
  "youtube_comments:comment_count": {
    label: "YouTube comments sampled",
    unit: "comments"
  },
  "youtube_comments:comment_like_count": {
    label: "YouTube comment likes",
    unit: "likes"
  },
  "youtube_comments:positive_comment_share": {
    label: "Positive comment share",
    unit: "percent"
  },
  "youtube_comments:negative_comment_share": {
    label: "Negative comment share",
    unit: "percent"
  },
  "gdelt:article_count": {
    label: "News articles",
    unit: "articles"
  },
  "gdelt:average_tone": {
    label: "News tone",
    unit: "tone"
  },
  "gdelt:source_count": {
    label: "News sources",
    unit: "sources"
  },
  "trade_flow:buy_value": {
    label: "Buy order value",
    unit: "cash"
  },
  "trade_flow:sell_value": {
    label: "Sell order value",
    unit: "cash"
  },
  "trade_flow:net_order_value": {
    label: "Net order value",
    unit: "cash"
  },
  "trade_flow:gross_order_value": {
    label: "Gross order value",
    unit: "cash"
  },
  "trade_flow:trade_count": {
    label: "Trade count",
    unit: "trades"
  },
  "trade_flow:unique_trader_count": {
    label: "Active traders",
    unit: "traders"
  }
};

export async function GET(request: Request, context: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await context.params;
  const range = normalizeRange(new URL(request.url).searchParams.get("range"));
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      artistId,
      range,
      series: [],
      hasRealObservations: false,
      observationStart: null,
      observationEnd: null
    });
  }

  try {
    const supabase = createAnonServerClient();
    const { data: artist, error: artistError } = await supabase
      .from("artists")
      .select("id")
      .eq("id", artistId)
      .eq("is_active", true)
      .single();

    if (artistError || !artist) {
      return NextResponse.json(
        {
          ok: false,
          error: artistError?.message ?? "Artist not found."
        },
        { status: 404 }
      );
    }

    const series = await loadObservationSeries({
      supabase,
      artistId,
      range
    });
    const dates = series.flatMap((item) => item.points.map((point) => point.date)).sort();

    return NextResponse.json({
      ok: true,
      source: "supabase",
      artistId,
      range,
      series,
      hasRealObservations: series.some((item) => item.points.length > 0),
      observationStart: dates[0] ?? null,
      observationEnd: dates[dates.length - 1] ?? null
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        error: error instanceof Error ? error.message : "Could not load market observations."
      },
      { status: 500 }
    );
  }
}

async function loadObservationSeries({
  supabase,
  artistId,
  range
}: {
  supabase: ReturnType<typeof createAnonServerClient>;
  artistId: string;
  range: ObservationRange;
}): Promise<MarketObservationSeries[]> {
  let query = supabase
    .from("market_observations")
    .select("source, metric, observed_date, value, unit")
    .eq("artist_id", artistId)
    .order("observed_date", { ascending: true });

  if (range !== "ALL") {
    query = query.gte("observed_date", shiftDate(getToday(), -RANGE_DAYS[range]));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Could not load market observations: ${error.message}`);
  }

  const grouped = ((data ?? []) as ObservationRow[]).reduce<Record<string, MarketObservationSeries>>((memo, row) => {
    const key = `${row.source}:${row.metric}`;
    const definition = SERIES_DEFINITIONS[key];

    if (!definition) {
      return memo;
    }

    memo[key] ??= {
      key,
      source: row.source,
      metric: row.metric,
      label: definition.label,
      unit: definition.unit || row.unit,
      points: [],
      latestValue: null,
      latestDate: null
    };
    memo[key].points.push({
      date: row.observed_date,
      value: Number(row.value)
    });
    memo[key].latestValue = Number(row.value);
    memo[key].latestDate = row.observed_date;
    return memo;
  }, {});

  return Object.values(grouped).sort((first, second) => first.label.localeCompare(second.label));
}

function normalizeRange(value: string | null): ObservationRange {
  if (value === "1M" || value === "3M" || value === "6M" || value === "1Y" || value === "ALL") {
    return value;
  }

  return "1M";
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}
