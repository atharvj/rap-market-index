"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ChangeText } from "@/components/RmiPrimitives";
import { useGame } from "@/components/GameProvider";
import { formatCurrency } from "@/lib/formatters";
import clsx from "clsx";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export function GlobalArtistSearch({ className }: { className?: string }) {
  const router = useRouter();
  const { state } = useGame();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return [...state.artists]
      .filter(
        (artist) =>
          !normalized ||
          artist.name.toLowerCase().includes(normalized) ||
          artist.ticker.toLowerCase().includes(normalized)
      )
      .sort((first, second) => {
        if (normalized) {
          const firstExact = first.name.toLowerCase() === normalized || first.ticker.toLowerCase() === normalized;
          const secondExact = second.name.toLowerCase() === normalized || second.ticker.toLowerCase() === normalized;

          if (firstExact !== secondExact) {
            return firstExact ? -1 : 1;
          }

          const firstStarts = first.name.toLowerCase().startsWith(normalized) || first.ticker.toLowerCase().startsWith(normalized);
          const secondStarts = second.name.toLowerCase().startsWith(normalized) || second.ticker.toLowerCase().startsWith(normalized);

          if (firstStarts !== secondStarts) {
            return firstStarts ? -1 : 1;
          }
        }

        return second.dailyChangePercent - first.dailyChangePercent || first.name.localeCompare(second.name);
      })
      .slice(0, 8);
  }, [query, state.artists]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function openArtist(artistId: string) {
    setOpen(false);
    setQuery("");
    router.push(`/artists/${artistId}`);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (suggestions[0]) {
      openArtist(suggestions[0].id);
    }
  }

  return (
    <div ref={rootRef} className={clsx("relative min-w-0", className)}>
      <form onSubmit={submit} role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-panelSoft pl-9 pr-3 text-sm outline-none placeholder:text-paper/35 focus:border-cyan"
          placeholder="Search artists"
          aria-label="Search artists"
          aria-expanded={open}
          aria-controls="global-artist-results"
        />
      </form>

      {open ? (
        <div id="global-artist-results" className="rmi-popover absolute left-0 right-0 top-12 z-[80] max-h-80 overflow-y-auto p-1 scrollbar-thin">
          {suggestions.length ? (
            suggestions.map((artist) => (
              <button
                key={artist.id}
                type="button"
                onClick={() => openArtist(artist.id)}
                className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left hover:bg-panelSoft focus-visible:bg-panelSoft"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <ArtistAvatar artist={artist} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{artist.name}</span>
                    <span className="block truncate text-xs text-paper/45">${artist.ticker} · {formatCurrency(artist.currentPrice)}</span>
                  </span>
                </span>
                <span className="shrink-0 text-xs"><ChangeText value={artist.dailyChangePercent} /></span>
              </button>
            ))
          ) : (
            <p className="px-3 py-5 text-center text-sm text-paper/50">No matching artists.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
