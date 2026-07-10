import type { Artist } from "@/lib/types";

export function ArtistAvatar({ artist, size = "md" }: { artist: Artist; size?: "sm" | "md" | "lg" | "xl" }) {
  const sizeClass = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-14 w-14 text-lg"
  }[size];

  return (
    <div
      className={`${sizeClass} grid shrink-0 place-items-center rounded-full border border-paper/10 bg-gradient-to-br ${artist.accent} font-black text-white shadow-market saturate-[0.9]`}
      aria-hidden="true"
    >
      {artist.ticker.slice(0, 2)}
    </div>
  );
}
