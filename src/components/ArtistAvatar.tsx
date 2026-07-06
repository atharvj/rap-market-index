import type { Artist } from "@/lib/types";

export function ArtistAvatar({ artist, size = "md" }: { artist: Artist; size?: "sm" | "md" | "lg" }) {
  const sizeClass = {
    sm: "h-9 w-9 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-16 w-16 text-xl"
  }[size];

  return (
    <div
      className={`${sizeClass} grid shrink-0 place-items-center rounded border border-paper/12 bg-gradient-to-br ${artist.accent} font-black text-paper shadow-market saturate-[0.82]`}
      aria-hidden="true"
    >
      {artist.ticker.slice(0, 2)}
    </div>
  );
}
