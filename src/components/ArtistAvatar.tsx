import type { Artist } from "@/lib/types";

export function ArtistAvatar({ artist, size = "md" }: { artist: Artist; size?: "sm" | "md" | "lg" | "xl" }) {
  const sizeClass = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-20 w-20 text-xl"
  }[size];

  return (
    <div
      className={`${sizeClass} relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-panelSoft font-semibold text-paper`}
      aria-label={artist.name}
      role="img"
    >
      <span aria-hidden="true">{artist.ticker.slice(0, 2)}</span>
      {artist.imageUrl ? (
        <img
          src={artist.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}
