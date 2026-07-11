import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ExternalIdRow = Pick<
  Database["public"]["Tables"]["artist_external_ids"]["Row"],
  "artist_id" | "youtube_channel_id"
>;

type YoutubeChannelResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      thumbnails?: Record<string, { url?: string }>;
    };
  }>;
};

const YOUTUBE_BATCH_SIZE = 50;

export async function loadArtistImageUrls(
  supabase: SupabaseClient<Database>,
  artistIds: string[],
  artistNames: Record<string, string> = {}
) {
  const uniqueArtistIds = Array.from(new Set(artistIds.filter(Boolean)));
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  if (!uniqueArtistIds.length) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("artist_external_ids")
    .select("artist_id,youtube_channel_id")
    .in("artist_id", uniqueArtistIds);

  if (error) {
    return new Map<string, string>();
  }

  const externalIds = (data ?? []) as ExternalIdRow[];
  const artistByChannelId = new Map(
    externalIds
      .filter((row) => Boolean(row.youtube_channel_id))
      .map((row) => [row.youtube_channel_id as string, row.artist_id])
  );
  const channelIds = Array.from(artistByChannelId.keys());
  const imageByArtistId = new Map<string, string>();

  for (let offset = 0; apiKey && offset < channelIds.length; offset += YOUTUBE_BATCH_SIZE) {
    const batch = channelIds.slice(offset, offset + YOUTUBE_BATCH_SIZE);
    const params = new URLSearchParams({
      part: "snippet",
      id: batch.join(","),
      key: apiKey
    });

    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, {
        next: { revalidate: 86_400 }
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as YoutubeChannelResponse;

      for (const channel of payload.items ?? []) {
        const artistId = channel.id ? artistByChannelId.get(channel.id) : null;
        const thumbnails = channel.snippet?.thumbnails;
        const imageUrl = thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;

        if (artistId && imageUrl) {
          imageByArtistId.set(artistId, imageUrl);
        }
      }
    } catch {
      // Portraits are decorative. A source outage should not block market data.
    }
  }

  const missingArtistIds = uniqueArtistIds.filter(
    (artistId) => !imageByArtistId.has(artistId) && Boolean(artistNames[artistId])
  );

  for (let offset = 0; offset < missingArtistIds.length; offset += 6) {
    const batch = missingArtistIds.slice(offset, offset + 6);
    const results = await Promise.all(
      batch.map(async (artistId) => ({
        artistId,
        imageUrl: await loadWikipediaPortrait(artistNames[artistId] ?? "")
      }))
    );

    for (const result of results) {
      if (result.imageUrl) {
        imageByArtistId.set(result.artistId, result.imageUrl);
      }
    }
  }

  return imageByArtistId;
}

async function loadWikipediaPortrait(artistName: string) {
  if (!artistName) {
    return null;
  }

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `${artistName} rapper musician`,
    gsrnamespace: "0",
    gsrlimit: "1",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "360"
  });

  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
      next: { revalidate: 604_800 },
      headers: {
        "User-Agent": "RapMarketIndex/1.0 (artist portrait lookup)"
      }
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as {
      query?: {
        pages?: Record<string, { title?: string; thumbnail?: { source?: string } }>;
      };
    };
    const page = Object.values(payload.query?.pages ?? {})[0];
    const normalizedArtistName = normalizeIdentityText(artistName);
    const normalizedPageTitle = normalizeIdentityText(page?.title ?? "");
    const identityMatches = normalizedArtistName.length >= 4 && (
      normalizedPageTitle.includes(normalizedArtistName) || normalizedArtistName.includes(normalizedPageTitle)
    );
    const imageUrl = identityMatches ? page?.thumbnail?.source : null;

    return imageUrl && imageUrl.startsWith("https://") ? imageUrl : null;
  } catch {
    return null;
  }
}

function normalizeIdentityText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}
