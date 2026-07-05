import { NextResponse } from "next/server";
import {
  createAnonServerClient,
  createServiceRoleClient,
  getSupabaseConfigStatus
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CloudCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export async function GET() {
  const config = getSupabaseConfigStatus();
  const checks: CloudCheck[] = [
    {
      id: "supabase-url",
      label: "Project URL",
      ok: config.urlConfigured,
      detail: config.urlConfigured ? "Configured" : "Missing NEXT_PUBLIC_SUPABASE_URL"
    },
    {
      id: "anon-key",
      label: "Public anon key",
      ok: config.anonKeyConfigured,
      detail: config.anonKeyConfigured ? "Configured" : "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY"
    },
    {
      id: "service-role",
      label: "Server service key",
      ok: config.serviceRoleConfigured,
      detail: config.serviceRoleConfigured ? "Configured" : "Needed for market update jobs"
    },
    {
      id: "market-secret",
      label: "Market job secret",
      ok: config.marketUpdateSecretConfigured,
      detail: config.marketUpdateSecretConfigured ? "Configured" : "Needed for protected admin updates"
    },
    {
      id: "cron-secret",
      label: "Cron secret",
      ok: true,
      detail: config.cronSecretConfigured ? "Configured" : "Needed when deployed with Vercel Cron"
    },
    {
      id: "lastfm-api-key",
      label: "Last.fm API key",
      ok: true,
      detail: config.lastfmApiKeyConfigured
        ? "Configured"
        : "Optional; needed for listener/playcount market signals"
    },
    {
      id: "spotify-credentials",
      label: "Spotify credentials",
      ok: true,
      detail: config.spotifyCredentialsConfigured
        ? "Configured"
        : "Optional; needed for Spotify popularity/follower signals"
    },
    {
      id: "youtube-api-key",
      label: "YouTube API key",
      ok: true,
      detail: config.youtubeApiKeyConfigured
        ? "Configured"
        : "Optional; needed for YouTube channel and comment reaction signals"
    }
  ];

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      connected: false,
      readyForCloudAccounts: false,
      readyForAdminJobs: false,
      checks
    });
  }

  try {
    const supabase = createAnonServerClient();
    const { count: artistCount, error: artistError } = await supabase
      .from("artists")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    const watchlistStorage = config.serviceRoleConfigured
      ? await probeWatchlistStorage()
      : {
          ok: false,
          detail: "Missing SUPABASE_SERVICE_ROLE_KEY"
        };
    const marketEngineStorage = config.serviceRoleConfigured
      ? await probeMarketEngineStorage()
      : {
          ok: false,
          detail: "Missing SUPABASE_SERVICE_ROLE_KEY"
        };

    checks.push(
      {
        id: "artist-seed",
        label: "Artist seed",
        ok: !artistError && (artistCount ?? 0) >= 10,
        detail: artistError ? artistError.message : `${artistCount ?? 0} active artists`
      },
      {
        id: "watchlist-storage",
        label: "Watchlist storage",
        ok: watchlistStorage.ok,
        detail: watchlistStorage.detail
      },
      {
        id: "market-engine-storage",
        label: "Market engine storage",
        ok: marketEngineStorage.ok,
        detail: marketEngineStorage.detail
      }
    );

    return NextResponse.json({
      ok: true,
      connected: true,
      readyForCloudAccounts: !artistError && watchlistStorage.ok && (artistCount ?? 0) > 0,
      readyForAdminJobs: config.readyForAdminWrites,
      checks
    });
  } catch (error) {
    checks.push({
      id: "database-read",
      label: "Database read",
      ok: false,
      detail: error instanceof Error ? error.message : "Could not read Supabase database"
    });

    return NextResponse.json(
      {
        ok: false,
        connected: false,
        readyForCloudAccounts: false,
        readyForAdminJobs: false,
        checks
      },
      { status: 500 }
    );
  }
}

async function probeWatchlistStorage() {
  const probeUserId = "00000000-0000-0000-0000-000000000000";
  const probeArtistId = "__watchlist_probe__";
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("watchlist").insert({
    user_id: probeUserId,
    artist_id: probeArtistId
  });

  if (!error) {
    await supabase.from("watchlist").delete().eq("user_id", probeUserId).eq("artist_id", probeArtistId);

    return {
      ok: true,
      detail: "Configured"
    };
  }

  const message = error.message.toLowerCase();

  if (message.includes("foreign key")) {
    return {
      ok: true,
      detail: "Configured"
    };
  }

  if (message.includes("schema cache") || message.includes("watchlist")) {
    return {
      ok: false,
      detail: "Run supabase/migrations/005_watchlist.sql"
    };
  }

  return {
    ok: false,
    detail: error.message
  };
}

async function probeMarketEngineStorage() {
  const supabase = createServiceRoleClient();
  const { error: externalIdsError } = await supabase
    .from("artist_external_ids")
    .select("artist_id", { count: "exact", head: true });

  if (externalIdsError) {
    return formatMarketEngineProbeError(externalIdsError.message);
  }

  const modelVersionStorage = await probeModelVersionStorage(supabase);

  if (!modelVersionStorage.ok) {
    return modelVersionStorage;
  }

  const { error: observationsError } = await supabase.from("market_observations").insert({
    artist_id: "__market_probe__",
    source: "system",
    metric: "probe",
    observed_date: "1970-01-01",
    value: 1,
    unit: "flag"
  });

  if (!observationsError) {
    await supabase
      .from("market_observations")
      .delete()
      .eq("artist_id", "__market_probe__")
      .eq("source", "system")
      .eq("metric", "probe")
      .eq("observed_date", "1970-01-01");
  }

  if (observationsError) {
    const message = observationsError.message.toLowerCase();

    if (!message.includes("foreign key")) {
      return formatMarketEngineProbeError(observationsError.message);
    }
  }

  const { error: eventsError } = await supabase.from("market_events").insert({
    artist_id: "__market_probe__",
    event_date: "1970-01-01",
    event_type: "news",
    title: "Storage probe"
  });

  if (!eventsError) {
    await supabase
      .from("market_events")
      .delete()
      .eq("artist_id", "__market_probe__")
      .eq("event_date", "1970-01-01")
      .eq("title", "Storage probe");

    return {
      ok: true,
      detail: "Configured"
    };
  }

  const eventsMessage = eventsError.message.toLowerCase();

  if (eventsMessage.includes("foreign key")) {
    return {
      ok: true,
      detail: "Configured"
    };
  }

  return formatMarketEngineProbeError(eventsError.message);
}

async function probeModelVersionStorage(supabase: ReturnType<typeof createServiceRoleClient>) {
  const checks = await Promise.all([
    supabase.from("price_history").select("model_version", { count: "exact", head: true }),
    supabase.from("market_signal_snapshots").select("model_version", { count: "exact", head: true }),
    supabase.from("market_update_runs").select("model_version", { count: "exact", head: true })
  ]);
  const failed = checks.find((check) => check.error);

  if (!failed?.error) {
    return {
      ok: true,
      detail: "Configured"
    };
  }

  return formatMarketEngineProbeError(failed.error.message);
}

function formatMarketEngineProbeError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("schema cache") ||
    normalized.includes("market_observations") ||
    normalized.includes("artist_external_ids") ||
    normalized.includes("market_events") ||
    normalized.includes("model_version")
  ) {
    return {
      ok: false,
      detail: "Run Supabase migrations through 008_market_model_version.sql"
    };
  }

  return {
    ok: false,
    detail: message
  };
}
