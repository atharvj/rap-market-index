"use client";

import { formatCompact, formatDate } from "@/lib/formatters";
import type { MarketObservationSeries } from "@/lib/types";
import clsx from "clsx";
import { Database, Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type ObservationRange = "1M" | "3M" | "6M" | "1Y";

type ObservationsResponse = {
  ok: boolean;
  error?: string;
  range?: ObservationRange;
  series?: MarketObservationSeries[];
  hasRealObservations?: boolean;
};

const ranges: ObservationRange[] = ["1M", "3M", "6M", "1Y"];

export function ArtistMarketInputsPanel({ artistId }: { artistId: string }) {
  const [range, setRange] = useState<ObservationRange>("1M");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [series, setSeries] = useState<MarketObservationSeries[]>([]);
  const [selectedKey, setSelectedKey] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    setStatus("loading");

    fetch(`/api/market/observations/${artistId}?range=${range}`, {
      signal: controller.signal
    })
      .then((response) => response.json() as Promise<ObservationsResponse>)
      .then((payload) => {
        if (!payload.ok || !payload.series) {
          throw new Error(payload.error ?? "Could not load market inputs.");
        }

        setSeries(payload.series);
        setSelectedKey((current) =>
          current && payload.series?.some((item) => item.key === current)
            ? current
            : payload.series?.[0]?.key ?? ""
        );
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setSeries([]);
        setSelectedKey("");
        setStatus(error instanceof Error ? "error" : "error");
      });

    return () => {
      controller.abort();
    };
  }, [artistId, range]);

  const selectedSeries = useMemo(
    () => series.find((item) => item.key === selectedKey) ?? series[0] ?? null,
    [selectedKey, series]
  );
  const subtitle = useMemo(() => {
    if (status === "loading") {
      return "Loading";
    }

    if (!selectedSeries?.points.length) {
      return "No observations";
    }

    const first = selectedSeries.points[0];
    const last = selectedSeries.points[selectedSeries.points.length - 1];

    if (!first || !last || first.date === last.date) {
      return last ? formatDate(last.date) : "No observations";
    }

    return `${formatDate(first.date)} - ${formatDate(last.date)}`;
  }, [selectedSeries, status]);

  return (
    <section className="rounded-md border border-line bg-panel/86 p-4 shadow-market sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan" aria-hidden="true" />
            <h2 className="text-xl font-black">Market inputs</h2>
          </div>
          <p className="mt-1 text-sm font-bold text-paper/45">{subtitle}</p>
        </div>
        <div className="inline-flex rounded-md border border-line bg-black/20 p-1">
          {ranges.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setRange(candidate)}
              className={clsx(
                "h-8 min-w-11 rounded px-2 text-xs font-black transition",
                range === candidate
                  ? "bg-brass text-ink"
                  : "text-paper/55 hover:bg-white/[0.04] hover:text-paper"
              )}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>

      {series.length ? (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {series.slice(0, 6).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedKey(item.key)}
                className={clsx(
                  "min-h-16 rounded-md border px-3 py-2 text-left transition",
                  selectedSeries?.key === item.key
                    ? "border-brass bg-brass/12"
                    : "border-line bg-black/18 hover:border-paper/25"
                )}
              >
                <span className="block text-[11px] font-black uppercase tracking-wide text-paper/42">
                  {item.label}
                </span>
                <span className="mt-1 block text-lg font-black number-tabular">
                  {item.latestValue === null ? "--" : formatObservationValue(item.latestValue, item.unit)}
                </span>
              </button>
            ))}
          </div>

          {selectedSeries ? (
            <ObservationChart series={selectedSeries} />
          ) : (
            <EmptyState status={status} />
          )}
        </>
      ) : (
        <EmptyState status={status} />
      )}
    </section>
  );
}

function ObservationChart({ series }: { series: MarketObservationSeries }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series.points} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(243,239,230,0.08)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            axisLine={false}
            tickLine={false}
            minTickGap={22}
            tick={{ fill: "rgba(243,239,230,0.55)", fontSize: 12 }}
          />
          <YAxis
            width={62}
            axisLine={false}
            tickLine={false}
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value) => formatObservationValue(Number(value), series.unit)}
            tick={{ fill: "rgba(243,239,230,0.55)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: "rgba(76,207,148,0.38)", strokeWidth: 1 }}
            contentStyle={{
              background: "#171b1e",
              border: "1px solid #2d3438",
              borderRadius: 8,
              color: "#f3efe6"
            }}
            labelFormatter={(value) => formatDate(String(value))}
            formatter={(value) => [formatObservationValue(Number(value), series.unit), series.label]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#62c7ff"
            strokeWidth={3}
            dot={series.points.length <= 8}
            activeDot={{ r: 5, strokeWidth: 0, fill: "#c99a45" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyState({ status }: { status: "loading" | "ready" | "error" }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-line bg-black/12 px-4 text-center">
      <div>
        <Radio className="mx-auto h-5 w-5 text-paper/35" aria-hidden="true" />
        <p className="mt-2 text-sm font-black text-paper/55">
          {status === "loading"
            ? "Loading market inputs"
            : status === "error"
              ? "Market inputs unavailable"
              : "No source observations yet"}
        </p>
      </div>
    </div>
  );
}

function formatObservationValue(value: number, unit: string) {
  if (unit === "score" || unit === "tone") {
    return value.toFixed(1);
  }

  if (unit === "videos" || unit === "articles" || unit === "sources") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0
    }).format(value);
  }

  return formatCompact(value);
}
