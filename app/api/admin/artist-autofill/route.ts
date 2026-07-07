import { NextResponse } from "next/server";
import { calculateHypeScore, getDailyChangePercent } from "@/lib/pricing";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ArtistCategory, HypeStats } from "@/lib/types";
import { requireAdminRequest } from "@/server/admin-auth";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { resolveArtistSourceIds, type SourceIdCandidate } from "@/server/market/source-id-resolver";
import { loadArtistExternalIds, upsertArtistExternalIds } from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";

type ArtistRow = Database["public"]["Tables"]["artists"]["Row"];

type ArtistAutofillBody = {
  name?: string;
  dryRun?: boolean;
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
  "from-violet-300 via-zinc-100 to-emerald-300",
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
    const starter = getDefaultStarterListing(name);
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
    const valuation = estimateStarterValuation(resolverResult.suggestions[0]?.candidates ?? {}, starter);
    const valuedArtist = {
      ...artist,
      currentPrice: valuation.price,
      previousClose: valuation.price,
      volatility: valuation.volatility,
      category: valuation.category
    };
    let finalArtist = mapMarketArtist(valuedArtist);
    let savedSourceIds: Awaited<ReturnType<typeof upsertArtistExternalIds>> = {};

    if (!dryRun) {
      if (valuation.source === "default") {
        finalArtist = mapArtistRow(await upsertArtist(supabase, valuedArtist));
      } else {
        await upsertArtist(supabase, valuedArtist);
        finalArtist = mapArtistRow(await updateStarterValuation(supabase, valuedArtist));
      }

      savedSourceIds = resolverResult.records.length
        ? await upsertArtistExternalIds(supabase, resolverResult.records)
        : {};
    }

    return NextResponse.json({
      ok: true,
      persisted: !dryRun,
      config,
      record: finalArtist,
      sourceIds: dryRun ? resolverResult.records[0] ?? null : savedSourceIds[artist.id] ?? null,
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
      }
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

async function parseBody(request: Request): Promise<ArtistAutofillBody> {
  try {
    return (await request.json()) as ArtistAutofillBody;
  } catch {
    return {};
  }
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
    is_active: true
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
      last_move_explanation: `${artist.ticker} was added with an estimated starting price from verified public source IDs.`
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

function getDefaultStarterListing(name: string) {
  const compactName = compactArtistName(name);
  const price = compactName.length <= 5 ? 15 : 25;
  const category: ArtistCategory = price >= 22 ? "rising" : "underground";

  return {
    price,
    category,
    volatility: category === "rising" ? 1.6 : 1.9,
    source: "default"
  };
}

function estimateStarterValuation(
  candidates: Partial<Record<"spotify" | "youtube" | "musicbrainz", SourceIdCandidate[]>>,
  fallback: ReturnType<typeof getDefaultStarterListing>
) {
  const spotify = candidates.spotify?.[0];
  const youtube = candidates.youtube?.[0];
  const prices = [
    spotify && spotify.confidence >= 0.88 ? getSpotifyStarterPrice(spotify) : null,
    youtube && youtube.confidence >= 0.88 ? getYoutubeStarterPrice(youtube) : null
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!prices.length) {
    return fallback;
  }

  const price = roundMoney(Math.max(...prices));
  const category = getCategoryFromPrice(price);

  return {
    source: spotify && spotify.confidence >= 0.88 ? "spotify/youtube" : "youtube",
    price,
    category,
    volatility: getVolatilityForCategory(category)
  };
}

function getSpotifyStarterPrice(candidate: SourceIdCandidate) {
  const popularity = getNumericMetadata(candidate, "popularity");
  const followers = getNumericMetadata(candidate, "followers");

  if (popularity === null && followers === null) {
    return null;
  }

  const popularityScore = popularity === null ? 0 : popularity;
  const followerScore = followers === null ? 0 : clamp((Math.log10(followers + 1) - 3) / 5, 0, 1) * 100;

  return clamp(8 + Math.max(popularityScore, followerScore) * 1.18, 6, 140);
}

function getYoutubeStarterPrice(candidate: SourceIdCandidate) {
  const subscribers = getNumericMetadata(candidate, "subscribers");
  const views = getNumericMetadata(candidate, "views");

  if (subscribers === null && views === null) {
    return null;
  }

  const subscriberScore = subscribers === null ? 0 : clamp((Math.log10(subscribers + 1) - 3) / 4, 0, 1) * 65;
  const viewScore = views === null ? 0 : clamp((Math.log10(views + 1) - 5) / 5, 0, 1) * 55;
  const audienceScore = subscriberScore * 0.58 + viewScore * 0.42;

  return clamp(8 + audienceScore * 1.35, 6, 135);
}

function getNumericMetadata(candidate: SourceIdCandidate, key: string) {
  const value = candidate.metadata[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function getCategoryFromPrice(price: number): ArtistCategory {
  if (price >= 100) {
    return "superstar";
  }

  if (price >= 55) {
    return "mainstream";
  }

  if (price >= 22) {
    return "rising";
  }

  return "underground";
}

function getVolatilityForCategory(category: ArtistCategory) {
  if (category === "superstar") {
    return 0.85;
  }

  if (category === "mainstream") {
    return 1.15;
  }

  if (category === "rising") {
    return 1.6;
  }

  return 1.95;
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
  const candidates = getTickerCandidates(name);

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
  const importantTokens = tokens.filter((token) => !["LIL", "YOUNG", "YUNG", "THE", "DJ", "MC"].includes(token));
  const importantCompact = importantTokens.join("");
  const fullCompact = tokens.join("");
  const initials = (importantTokens.length ? importantTokens : tokens).map((token) => token[0]).join("");
  const rawCandidates = [importantCompact, fullCompact, initials, fullCompact.slice(0, 8), `${initials}${fullCompact}`];
  const candidates = rawCandidates
    .map((candidate) => candidate.replace(/[^A-Z0-9]/g, "").slice(0, 8))
    .filter((candidate) => /^[A-Z0-9]{2,8}$/.test(candidate));

  return Array.from(new Set(candidates.length ? candidates : ["ARTIST"]));
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
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
