"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import clsx from "clsx";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function WatchlistButton({
  artistId,
  label = false,
  compact = false
}: {
  artistId: string;
  label?: boolean;
  compact?: boolean;
}) {
  const { isWatchlisted, toggleWatchlist, syncMode } = useGame();
  const { session } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const active = isWatchlisted(artistId);
  const action = active ? "Remove from watchlist" : "Add to watchlist";
  const title = session && syncMode === "supabase" ? message || action : "Sign in to save a watchlist";

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeout = window.setTimeout(() => setMessage(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function toggle() {
    if (!session) {
      router.push("/account");
      return;
    }

    setSubmitting(true);
    const result = await toggleWatchlist(artistId);
    setMessage(result.message);
    setMessageIsError(!result.ok);
    setSubmitting(false);
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={toggle}
        disabled={submitting}
        title={title}
        aria-label={action}
        className={clsx(
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60",
          compact ? "h-8 w-8 px-0" : "min-h-9 px-2.5",
          active
            ? "border-brass/45 bg-brass/[0.15] text-brass"
            : "border-line bg-panel text-paper/50 hover:border-brass/40 hover:text-brass"
        )}
      >
        <Star className={clsx("h-4 w-4", active ? "fill-current" : "")} aria-hidden="true" />
        {label ? <span>{active ? "Watching" : "Watch"}</span> : null}
      </button>
      {message ? (
        <span
          role={messageIsError ? "alert" : "status"}
          className={clsx(
            "absolute right-0 top-11 z-40 w-max max-w-56 border px-3 py-2 text-xs font-semibold shadow-[var(--shadow-popover)]",
            messageIsError
              ? "border-ember/45 bg-panel text-ember"
              : "border-line bg-panel text-paper"
          )}
        >
          {message}
        </span>
      ) : null}
    </span>
  );
}
