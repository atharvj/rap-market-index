import { buildAudienceScaleCalibration } from "@/server/market/audience-scale";
import { collectSpotifyPublicSignals } from "@/server/market/spotify-public-source";
import { collectYoutubeMarketSignals } from "@/server/market/youtube-source";
import { collectLastfmMarketSignals } from "@/server/market/lastfm-source";
import { mergeAdapterSignals } from "@/server/market/daily-update";
import { getMarketDate } from "@/server/market/market-date";
import type { ArtistExternalIds } from "@/server/market/market-data";
import { NextResponse } from "next/server";
import { formatArtistDisplayName, getArtistTickerOverride } from "@/lib/artist-display-name";
import { calculateHypeScore, getDailyChangePercent } from "@/lib/pricing";
import {
  getStarterCategory,
  getStarterVolatility
} from "@/lib/starter-valuation";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ArtistCategory, HypeStats } from "@/lib/types";
import { requireAdminRequest } from "@/server/admin-auth";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { resolveArtistSourceIds } from "@/server/market/source-id-resolver";
import { loadArtistExternalIds, persistMarketObservations, upsertArtistExternalIds } from "@/server/market/supabase-repository";
import { getMarketModelVersion } from "@/server/market/model-version";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ArtistRow = Database["public"]["Tables"]["artists"]["Row"];

type ArtistAutofillBody = {
  name?: string;
  dryRun?: boolean;
  sourceIds?: ArtistAutofillSourceIdsInput | null;
};

type ArtistAutofillSourceIdsInput = {
  spotifyId?: unknown;
  youtubeChannelId?: unknown;
  musicbrainzId?: unknown;
  lastfmName?: unknown;
  gdeltQuery?: unknown;
};

const DEFAULT_STATS: HypeStats = {
  streamingGrowth: 0,
  youtubeGrowth: 0,
  searchGrowth: 0,
  socialGrowth: 0,
  newsScore: 50,
  traderDemand: 0
};

const ACCENTS = [
  "from-fuchsia-300 via-lime-200 to-cyan-300",
  "from-sky-300 via-pink-200 to-yellow-200",
  "from-lime-300 via-cyan-200 to-zinc-100",
  "from-rose-300 via-emerald-200 to-stone-100",
  "from-sky-300 via-zinc-100 to-emerald-300",
  "from-red-300 via-zinc-100 to-cyan-300",
  "from-blue-300 via-stone-100 to-emerald-300",
  "from-amber-200 via-fuchsia-200 to-cyan-300"
];

export async function POST(request: Request) {
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
    const body = await parseBody(request);
    const name = normalizeArtistName(body.name);
    const dryRun = body.dryRun !== false;

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          error: "Enter an artist name."
        },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    const existingRows = await loadArtistRows(supabase);
    const artistId = getUniqueArtistId(slugifyArtistName(name), existingRows);
    const duplicate = existingRows.find((row) => normalizeForCompare(row.name) === normalizeForCompare(name));

    if (duplicate) {
      return NextResponse.json(
        {
          ok: false,
          error: `${duplicate.name} is already in the roster as ${duplicate.ticker}.`,
          record: mapArtistRow(duplicate)
        },
        { status: 409 }
      );
    }

    const ticker = getUniqueTicker(name, existingRows);
    const starter = getDefaultStarterListing();
    const artist = buildMarketArtist({
      id: artistId,
      name,
      ticker,
      price: starter.price,
      category: starter.category,
      volatility: starter.volatility
    });
    const externalIds = dryRun ? {} : await loadArtistExternalIds(supabase, [artist.id]);
    const resolverResult = await resolveArtistSourceIds({
      artists: [artist],
      externalIds,
      sources: ["spotify", "youtube", "musicbrainz"],
      credentials: {
        spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
        spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        youtubeApiKey: process.env.YOUTUBE_API_KEY
      },
      minConfidence: 0.88,
      delayMs: 0
    });
    const previewSourceIds = normalizePreviewSourceIds(body.sourceIds, artist.id);
    const sourceRecords = previewSourceIds ? [previewSourceIds] : resolverResult.records;
    const record = sourceRecords[0];
    const verifiedIds: Record<string, ArtistExternalIds> = record ? { [artist.id]: {
      artistId: artist.id, spotifyId: record.spotifyId ?? undefined,
      youtubeChannelId: record.youtubeChannelId ?? undefined, musicbrainzId: record.musicbrainzId ?? undefined,
      lastfmName: record.lastfmName ?? undefined
    } } : {};
    const audienceOptions = { artists: [artist], externalIds: verifiedIds, runDate: getMarketDate(), delayMs: 0 };
    const [spotifyAudience, youtubeAudience, lastfmAudience] = await Promise.all([
      collectSpotifyPublicSignals(audienceOptions),
      collectYoutubeMarketSignals({ ...audienceOptions, apiKey: process.env.YOUTUBE_API_KEY }),
      collectLastfmMarketSignals({ ...audienceOptions, apiKey: process.env.LASTFM_API_KEY })
    ]);
    const calibration = buildAudienceScaleCalibration(mergeAdapterSignals(spotifyAudience.signals, youtubeAudience.signals, lastfmAudience.signals)[artist.id] ?? { stats: {}, rawPayload: {} });
    const price = calibration.targetPrice ?? starter.price;
    const category = getStarterCategory(price);
    const valuation = { price, category, volatility: getStarterVolatility(category), source: calibration.targetPrice ? "verified_audience" : "default" };
    resolverResult.warnings.push(...spotifyAudience.warnings, ...youtubeAudience.warnings, ...lastfmAudience.warnings);
    const valuedArtist = {
      ...artist,
      currentPrice: valuation.price,
      previousClose: valuation.price,
      volatility: valuation.volatility,
      category: valuation.category
    };
    let finalArtist = mapMarketArtist(valuedArtist);
    let savedSourceIds: Awaited<ReturnType<typeof upsertArtistExternalIds>> = {};
    const listingReadiness = getListingReadiness(sourceRecords[0]);

    if (!dryRun) {
      if (!listingReadiness.ready || calibration.directSourceCount < 2 || valuation.source === "default") {
        return NextResponse.json(
          {
            ok: false,
            error: `${name} is not ready to list. A verified YouTube channel, Spotify or MusicBrainz identity, and usable audience measurements from at least two platforms are required.`,
            listingReadiness
          },
          { status: 422 }
        );
      }

      // Keep incomplete listings off the market until their source records,
      // measurements and honest opening history are all saved.
      await upsertArtist(supabase, valuedArtist);
      savedSourceIds = sourceRecords.length ? await upsertArtistExternalIds(supabase, sourceRecords) : {};
      await persistMarketObservations(supabase, [...spotifyAudience.observations, ...youtubeAudience.observations, ...lastfmAudience.observations]);
      const modelVersion = getMarketModelVersion();
      const opening = await supabase.from("price_history").insert({
        artist_id: artist.id, price_date: audienceOptions.runDate, price: valuation.price,
        hype_score: valuedArtist.hypeScore, model_version: modelVersion,
        explanation: `${artist.ticker} opened using the shared verified audience valuation.`
      });
      if (opening.error) throw new Error(`Could not save opening history: ${opening.error.message}`);
      const tick = await supabase.from("price_ticks").insert({
        artist_id: artist.id, price: valuation.price, source: "market_run", model_version: modelVersion,
        raw_payload: { source: "listing_open", runDate: audienceOptions.runDate }
      });
      if (tick.error) throw new Error(`Could not save opening quote: ${tick.error.message}`);
      finalArtist = mapArtistRow(await updateStarterValuation(supabase, valuedArtist));
    }

    return NextResponse.json({
      ok: true,
      persisted: !dryRun,
      config,
      record: finalArtist,
      sourceIds: dryRun ? sourceRecords[0] ?? null : savedSourceIds[artist.id] ?? null,
      resolver: {
        proposedRecordCount: resolverResult.records.length,
        warnings: resolverResult.warnings,
        suggestions: resolverResult.suggestions
      },
      starter: {
        source: valuation.source,
        price: valuation.price,
        category: valuation.category,
        volatility: valuation.volatility
      },
      listingReadiness
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Artist autofill failed.",
        config
      },
      { status: 500 }
    );
  }
}

function getListingReadiness(record: {
  youtubeChannelId?: unknown;
  spotifyId?: unknown;
  musicbrainzId?: unknown;
} | null | undefined) {
  const hasYoutube = Boolean(record?.youtubeChannelId);
  const hasIdentitySource = Boolean(record?.spotifyId || record?.musicbrainzId);

  return {
    ready: hasYoutube && hasIdentitySource,
    hasYoutube,
    hasIdentitySource,
    status: hasYoutube && hasIdentitySource ? "ready" : "needs_verified_sources"
  };
}

async function parseBody(request: Request): Promise<ArtistAutofillBody> {
  try {
    return (await request.json()) as ArtistAutofillBody;
  } catch {
    return {};
  }
}

function normalizePreviewSourceIds(input: ArtistAutofillBody["sourceIds"], artistId: string) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = {
    artistId,
    spotifyId: normalizeOptionalText(input.spotifyId, 120),
    youtubeChannelId: normalizeOptionalText(input.youtubeChannelId, 180),
    musicbrainzId: normalizeOptionalText(input.musicbrainzId, 80),
    lastfmName: normalizeOptionalText(input.lastfmName, 120),
    gdeltQuery: normalizeOptionalText(input.gdeltQuery, 320)
  };

  return record.spotifyId || record.youtubeChannelId || record.musicbrainzId || record.lastfmName || record.gdeltQuery
    ? record
    : null;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) || undefined : undefined;
}

async function loadArtistRows(supabase: ReturnType<typeof createServiceRoleClient>) {
  const { data, error } = await supabase.from("artists").select("*").order("ticker", { ascending: true });

  if (error) {
    throw new Error(`Could not load artist roster: ${error.message}`);
  }

  return (data ?? []) as ArtistRow[];
}

async function upsertArtist(supabase: ReturnType<typeof createServiceRoleClient>, artist: MarketUpdateArtist) {
  const row = {
    id: artist.id,
    name: artist.name,
    ticker: artist.ticker,
    current_price: artist.currentPrice,
    previous_close: artist.previousClose,
    daily_change_percent: getDailyChangePercent(artist.currentPrice, artist.previousClose),
    hype_score: artist.hypeScore,
    volatility: artist.volatility,
    category: artist.category,
    accent: getAccent(artist.name),
    last_move_explanation: `${artist.ticker} was added to the market roster.`,
    is_active: false
  };
  const { data, error } = await supabase.from("artists").insert(row).select("*").single();

  if (error) {
    throw new Error(`Could not add ${artist.name}: ${error.message}`);
  }

  const stats = await supabase.from("artist_stats").upsert(
    {
      artist_id: artist.id,
      streaming_growth: DEFAULT_STATS.streamingGrowth,
      youtube_growth: DEFAULT_STATS.youtubeGrowth,
      search_growth: DEFAULT_STATS.searchGrowth,
      social_growth: DEFAULT_STATS.socialGrowth,
      news_score: DEFAULT_STATS.newsScore,
      trader_demand: DEFAULT_STATS.traderDemand
    },
    { onConflict: "artist_id" }
  );

  if (stats.error) {
    throw new Error(`Could not create ${artist.ticker} stats: ${stats.error.message}`);
  }

  return data as ArtistRow;
}

async function updateStarterValuation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  artist: MarketUpdateArtist
) {
  const { data, error } = await supabase
    .from("artists")
    .update({
      current_price: artist.currentPrice,
      previous_close: artist.previousClose,
      daily_change_percent: getDailyChangePercent(artist.currentPrice, artist.previousClose),
      volatility: artist.volatility,
      category: artist.category,
      last_move_explanation: `${artist.ticker} opened using the shared verified audience valuation.`,
      is_active: true
    })
    .eq("id", artist.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not update ${artist.ticker} starter valuation: ${error.message}`);
  }

  return data as ArtistRow;
}

function buildMarketArtist({
  id,
  name,
  ticker,
  price,
  category,
  volatility
}: {
  id: string;
  name: string;
  ticker: string;
  price: number;
  category: ArtistCategory;
  volatility: number;
}): MarketUpdateArtist {
  return {
    id,
    name,
    ticker,
    currentPrice: price,
    previousClose: price,
    hypeScore: calculateHypeScore(DEFAULT_STATS),
    volatility,
    category,
    stats: DEFAULT_STATS
  };
}

function getDefaultStarterListing() {
  const price = 25;
  const category: ArtistCategory = price >= 22 ? "rising" : "underground";

  return {
    price,
    category,
    volatility: category === "rising" ? 1.6 : 1.9,
    source: "default"
  };
}

function getUniqueArtistId(baseId: string, existingRows: ArtistRow[]) {
  const used = new Set(existingRows.map((row) => row.id));
  const cleanBase = baseId || "artist";

  if (!used.has(cleanBase)) {
    return cleanBase;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${cleanBase}-${index}`;

    if (!used.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not create a unique artist ID.");
}

function getUniqueTicker(name: string, existingRows: ArtistRow[]) {
  const used = new Set(existingRows.map((row) => row.ticker));
  const override = getArtistTickerOverride(name);
  const candidates = override ? [override, ...getTickerCandidates(name)] : getTickerCandidates(name);

  for (const candidate of candidates) {
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  const base = candidates[0]?.slice(0, 6) || "ART";

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}${index}`.slice(0, 8);

    if (!used.has(candidate) && /^[A-Z0-9]{2,8}$/.test(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not create a unique ticker.");
}

function getTickerCandidates(name: string) {
  const tokens = tokenizeArtistName(name);
  const ignoredPrefixes = ["LIL", "YOUNG", "YUNG", "THE", "DJ", "MC", "NBA", "YNW"];
  const importantTokens = tokens.filter((token) => !ignoredPrefixes.includes(token));
  const importantCompact = importantTokens.join("");
  const fullCompact = tokens.join("");
  const initials = (importantTokens.length ? importantTokens : tokens).map((token) => token[0]).join("");
  const shortNameCandidates = getShortNameTickerCandidates(tokens, importantTokens);
  const rawCandidates = [...shortNameCandidates, importantCompact, fullCompact, initials, fullCompact.slice(0, 8), `${initials}${fullCompact}`];
  const candidates = rawCandidates
    .map((candidate) => candidate.replace(/[^A-Z0-9]/g, "").slice(0, 8))
    .filter((candidate) => /^[A-Z0-9]{2,8}$/.test(candidate));

  return Array.from(new Set(candidates.length ? candidates : ["ARTIST"]));
}

function getShortNameTickerCandidates(tokens: string[], importantTokens: string[]) {
  const candidates: string[] = [];
  const primary = importantTokens[0] ?? tokens[0];

  if (primary && primary.length >= 3 && primary.length <= 6) {
    candidates.push(primary);
  }

  if (importantTokens.length >= 2) {
    const initials = importantTokens.map((token) => token[0]).join("");

    if (initials.length >= 2) {
      candidates.push(initials);
    }
  }

  const lastImportantToken = importantTokens.at(-1);

  if (lastImportantToken && lastImportantToken !== primary && lastImportantToken.length >= 3 && lastImportantToken.length <= 6) {
    candidates.push(lastImportantToken);
  }

  return candidates;
}

function tokenizeArtistName(value: string) {
  return value
    .replace(/\$/g, "s")
    .replace(/&/g, " and ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeArtistName(value: unknown) {
  return formatArtistDisplayName(value);
}

function slugifyArtistName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\$/g, "s")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compactArtistName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "");
}

function normalizeForCompare(value: string) {
  return compactArtistName(value).toLowerCase();
}

function getAccent(name: string) {
  const index = Math.abs(hashString(name)) % ACCENTS.length;

  return ACCENTS[index];
}

function hashString(value: string) {
  return value.split("").reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 0);
}

function roundMoney(value: number) {
  return Math.max(1, Math.round(value * 100) / 100);
}

function mapArtistRow(row: ArtistRow) {
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    currentPrice: Number(row.current_price),
    previousClose: Number(row.previous_close),
    dailyChangePercent: Number(row.daily_change_percent),
    hypeScore: row.hype_score,
    volatility: Number(row.volatility),
    category: row.category,
    accent: row.accent,
    isActive: row.is_active
  };
}

function mapMarketArtist(artist: MarketUpdateArtist) {
  return {
    id: artist.id,
    name: artist.name,
    ticker: artist.ticker,
    currentPrice: artist.currentPrice,
    previousClose: artist.previousClose,
    dailyChangePercent: getDailyChangePercent(artist.currentPrice, artist.previousClose),
    hypeScore: artist.hypeScore,
    volatility: artist.volatility,
    category: artist.category,
    accent: getAccent(artist.name),
    isActive: true
  };
}
