"use client";

import { useGame } from "@/components/GameProvider";
import { RmiSection } from "@/components/RmiPrimitives";
import { formatDate } from "@/lib/formatters";
import type { MarketForecast, MarketForecastKind } from "@/lib/types";
import clsx from "clsx";
import { LineChart, Telescope } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type ForecastsResponse = {
  ok: boolean;
  forecasts?: MarketForecast[];
};

export function CrowdForecasts({
  artistId,
  limit = 6,
  variant = "home"
}: {
  artistId?: string;
  limit?: number;
  variant?: "home" | "artist";
}) {
  const { state } = useGame();
  const [forecasts, setForecasts] = useState<MarketForecast[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(limit) });
    setForecasts([]);

    if (artistId) {
      params.set("artistId", artistId);
    }

    fetch(`/api/market/forecasts?${params}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<ForecastsResponse>)
      .then((payload) => {
        if (payload.ok && Array.isArray(payload.forecasts)) {
          setForecasts(payload.forecasts);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setForecasts([]);
        }
      });

    return () => controller.abort();
  }, [artistId, limit]);

  if (!forecasts.length) {
    return null;
  }

  const artistsById = new Map(state.artists.map((artist) => [artist.id, artist]));

  return (
    <RmiSection
      title={<span className="flex items-center gap-2"><Telescope className="h-4 w-4 text-violet" /> Crowd Forecasts</span>}
      subtitle="What prediction markets currently expect about future music outcomes. These are estimates, not facts."
    >
      <div
        className={clsx(
          "grid gap-px bg-line/70",
          variant === "home" ? "md:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"
        )}
      >
        {forecasts.map((forecast) => {
          const artist = artistsById.get(forecast.artistId);
          const content = <ForecastCard forecast={forecast} artistName={artist?.name} />;

          return variant === "home" && artist ? (
            <Link
              key={`${forecast.artistId}:${forecast.id}`}
              href={`/artists/${artist.id}`}
              className="bg-panel transition-colors hover:bg-violet/[0.045]"
            >
              {content}
            </Link>
          ) : (
            <div key={`${forecast.artistId}:${forecast.id}`} className="bg-panel">
              {content}
            </div>
          );
        })}
      </div>
      <div className="border-t border-line/70 px-4 py-2.5 text-[11px] leading-4 text-paper/42">
        RMI records the probability for insight. Only a meaningful change in a liquid, active market can weakly influence a quote.
      </div>
    </RmiSection>
  );
}

function ForecastCard({
  forecast,
  artistName
}: {
  forecast: MarketForecast;
  artistName?: string;
}) {
  const change = forecast.artistOutlookChangePoints;
  const changeTone =
    typeof change !== "number"
      ? "text-paper/40"
      : change > 0
        ? "text-mint"
        : change < 0
          ? "text-ember"
          : "text-paper/45";

  return (
    <article className="flex h-full min-h-44 flex-col px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {artistName ? <p className="truncate text-xs font-semibold text-violet">{artistName}</p> : null}
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-paper/38">
            {getKindLabel(forecast.kind)}
            {forecast.isNew ? " · New forecast" : ""}
          </p>
        </div>
        <LineChart className="h-4 w-4 shrink-0 text-paper/28" aria-hidden="true" />
      </div>

      <h3 className="mt-3 line-clamp-3 text-sm font-semibold leading-5 text-paper/88">
        {forecast.question}
      </h3>

      <div className="mt-auto flex items-end justify-between gap-4 pt-4">
        <div>
          <p className="text-2xl font-bold number-tabular">{formatProbability(forecast.probabilityPercent)}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper/38">
            Yes probability
          </p>
        </div>
        <div className="text-right">
          <p className={clsx("text-sm font-semibold number-tabular", changeTone)}>
            {formatOutlookChange(change)}
          </p>
          <p className="mt-0.5 text-[10px] text-paper/36">
            {forecast.marketQuality === "established" ? "Stronger market" : "Developing market"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/60 pt-2 text-[10px] text-paper/34">
        <span>
          {forecast.direction === "bearish_yes"
            ? "A Yes outcome is negative"
            : forecast.direction === "informational"
              ? "Informational outcome"
              : "A Yes outcome is positive"}
        </span>
        <span className="shrink-0">As of {formatDate(forecast.asOf)}</span>
      </div>
    </article>
  );
}

function getKindLabel(kind: MarketForecastKind) {
  const labels: Record<MarketForecastKind, string> = {
    release: "Release",
    chart: "Chart outcome",
    award: "Award",
    streaming: "Streaming",
    sales: "Sales",
    collaboration: "Collaboration",
    tour: "Tour / live",
    other: "Music outcome"
  };

  return labels[kind];
}

function formatProbability(value: number) {
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function formatOutlookChange(value: number | null) {
  if (typeof value !== "number") {
    return "No daily move";
  }

  if (Math.abs(value) < 0.05) {
    return "Flat today";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}
