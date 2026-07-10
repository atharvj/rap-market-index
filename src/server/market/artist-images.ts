import { createAnonServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

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
  supabase: ReturnType<typeof createAnonServerClient>,
  artistIds: string[]
) {
  const uniqueArtistIds = Array.from(new Set(artistIds.filter(Boolean)));
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  if (!apiKey || !uniqueArtistIds.length) {
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

  for (let offset = 0; offset < channelIds.length; offset += YOUTUBE_BATCH_SIZE) {
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

  return imageByArtistId;
}
