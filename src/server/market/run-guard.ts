import type { MarketUpdateSource } from "@/server/market/daily-update";

export type ExistingMarketRun = {
  run_date: string;
  status: "running" | "succeeded" | "failed";
  source: string;
  started_at: string;
  completed_at: string | null;
  summary: unknown;
  error_message: string | null;
};

export type MarketRunCoverage = {
  activeArtistCount: number;
  completedArtistCount: number;
};

const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

export function getMarketRunSkipDecision({
  run,
  source,
  coverage,
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS
}: {
  run: ExistingMarketRun;
  source: MarketUpdateSource;
  coverage: MarketRunCoverage;
  now?: number;
  staleAfterMs?: number;
}): { skip: boolean; reason: string } {
  if (run.source !== source) {
    return {
      skip: false,
      reason: `The existing run used ${run.source}, not ${source}.`
    };
  }

  if (run.status === "failed") {
    return {
      skip: false,
      reason: "The previous run failed and can be retried."
    };
  }

  if (run.status === "running") {
    const startedAt = new Date(run.started_at).getTime();
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : Number.POSITIVE_INFINITY;

    if (ageMs < staleAfterMs) {
      return {
        skip: true,
        reason: "A recent market update is still running."
      };
    }

    return {
      skip: false,
      reason: "The previous running update is stale and can be recovered."
    };
  }

  const complete =
    coverage.activeArtistCount > 0 &&
    coverage.completedArtistCount >= coverage.activeArtistCount;

  if (complete) {
    return {
      skip: true,
      reason: `All ${coverage.activeArtistCount} active artists already have a close for this market date.`
    };
  }

  return {
    skip: false,
    reason: `Only ${coverage.completedArtistCount} of ${coverage.activeArtistCount} active artists have a close.`
  };
}
