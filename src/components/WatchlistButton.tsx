"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import clsx from "clsx";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function WatchlistButton({
  artistId,
  label = false
}: {
  artistId: string;
  label?: boolean;
}) {
  const { isWatchlisted, toggleWatchlist, syncMode } = useGame();
  const { session } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const active = isWatchlisted(artistId);
  const action = active ? "Remove from watchlist" : "Add to watchlist";
  const title = session && syncMode === "supabase" ? message || action : "Sign in to save a watchlist";

  async function toggle() {
    if (!session) {
      router.push("/account");
      return;
    }

    setSubmitting(true);
    const result = await toggleWatchlist(artistId);
    setMessage(result.message);
    setSubmitting(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={submitting}
      title={title}
      aria-label={action}
      className={clsx(
        "inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded border px-2.5 text-sm font-black transition disabled:cursor-wait disabled:opacity-60",
        active
          ? "border-brass/45 bg-brass/[0.15] text-brass"
          : "border-line bg-panel text-paper/50 hover:border-brass/40 hover:text-brass"
      )}
    >
      <Star className={clsx("h-4 w-4", active ? "fill-current" : "")} aria-hidden="true" />
      {label ? <span>{active ? "Watching" : "Watch"}</span> : null}
    </button>
  );
}
