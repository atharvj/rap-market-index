import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { MarketObservationSeries } from "@/lib/types";
import { getPacificMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { reportServerError } from "@/server/observability";

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
const CACHE_HEADERS = { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=1800" };

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
  "media_rss:article_count": {
    label: "Media feed articles",
    unit: "articles"
  },
  "media_rss:source_count": {
    label: "Media feed sources",
    unit: "sources"
  },
  "media_rss:classified_event_count": {
    label: "Media feed events",
    unit: "events"
  },
  "reddit:post_count": {
    label: "Community posts",
    unit: "posts"
  },
  "reddit:engagement_score": {
    label: "Community engagement",
    unit: "engagement"
  },
  "reddit:hype_post_count": {
    label: "Community hype posts",
    unit: "posts"
  },
  "reddit:negative_post_count": {
    label: "Community negative posts",
    unit: "posts"
  },
  "reddit:catalyst_post_count": {
    label: "Community catalyst posts",
    unit: "posts"
  },
  "bluesky:post_count": {
    label: "Social posts",
    unit: "posts"
  },
  "bluesky:engagement_score": {
    label: "Social engagement",
    unit: "engagement"
  },
  "bluesky:hype_post_count": {
    label: "Social hype posts",
    unit: "posts"
  },
  "bluesky:negative_post_count": {
    label: "Social negative posts",
    unit: "posts"
  },
  "bluesky:catalyst_post_count": {
    label: "Social catalyst posts",
    unit: "posts"
  },
  "bluesky:unique_author_count": {
    label: "Social authors",
    unit: "authors"
  },
  "bluesky:top_post_engagement": {
    label: "Top social post",
    unit: "engagement"
  },
  "bluesky:average_sentiment": {
    label: "Social sentiment",
    unit: "score"
  },
  "wikimedia:pageviews_7d": {
    label: "Public attention",
    unit: "views"
  },
  "wikimedia:pageviews_1d": {
    label: "Daily public attention",
    unit: "views"
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
  },
  "trade_flow:signal_eligibility": {
    label: "Order-flow signal eligibility",
    unit: "boolean"
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
    }, { headers: CACHE_HEADERS });
  }

  if (!config.serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, error: "Market observations are temporarily unavailable." },
      { status: 503, headers: CACHE_HEADERS }
    );
  }

  try {
    const supabase = createServiceRoleClient();
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
          error: "Artist not found."
        },
        { status: 404, headers: CACHE_HEADERS }
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
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    reportServerError(error, "market.observations");
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        error: "Market observations are temporarily unavailable."
      },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}

async function loadObservationSeries({
  supabase,
  artistId,
  range
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistId: string;
  range: ObservationRange;
}): Promise<MarketObservationSeries[]> {
  let query = supabase
    .from("market_observations")
    .select("source, metric, observed_date, value, unit")
    .eq("artist_id", artistId)
    .order("observed_date", { ascending: true });

  if (range !== "ALL") {
    query = query.gte("observed_date", shiftMarketDate(getPacificMarketDate(), -RANGE_DAYS[range]));
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
