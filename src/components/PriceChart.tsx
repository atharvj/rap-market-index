"use client";

import { formatCurrency, formatDate } from "@/lib/formatters";
import type { PricePoint } from "@/lib/types";
import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type ChartInteraction = {
  activeLabel?: string | number;
  activePayload?: Array<{ value?: number | string }>;
};

export function PriceChart({
  data,
  height = 270,
  compact = false
}: {
  data: PricePoint[];
  height?: number;
  compact?: boolean;
}) {
  const normalized = useMemo(() => data.filter((point) => Number.isFinite(point.price)), [data]);
  const positive = normalized.length < 2 || normalized[normalized.length - 1].price >= normalized[0].price;
  const [selected, setSelected] = useState<PricePoint | null>(null);
  const color = positive ? "rgb(var(--color-mint))" : "rgb(var(--color-ember))";
  const chartId = useId().replace(/:/g, "");
  const gradientId = `quote-${chartId}-${positive ? "up" : "down"}`;
  const firstTimestamp = normalized.length ? new Date(normalized[0].date).getTime() : 0;
  const lastTimestamp = normalized.length ? new Date(normalized[normalized.length - 1].date).getTime() : 0;
  const intraday = Number.isFinite(firstTimestamp) && Number.isFinite(lastTimestamp) && lastTimestamp - firstTimestamp <= 48 * 60 * 60 * 1000;
  const prices = normalized.map((point) => point.price);
  const minimumPrice = Math.min(...prices);
  const maximumPrice = Math.max(...prices);
  const visibleRange = maximumPrice - minimumPrice;
  const verticalPadding = Math.max(visibleRange * 0.14, maximumPrice * 0.0015, 0.02);
  const yDomain: [number, number] = [
    Math.max(0, minimumPrice - verticalPadding),
    maximumPrice + verticalPadding
  ];

  function formatChartDate(value: string, detailed = false) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return formatDate(value);
    }

    if (intraday) {
      return new Intl.DateTimeFormat("en-US", {
        month: detailed ? "short" : undefined,
        day: detailed ? "numeric" : undefined,
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles"
      }).format(date);
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: detailed ? "numeric" : undefined,
      timeZone: "America/Los_Angeles"
    }).format(date);
  }

  function selectPoint(state: ChartInteraction | null) {
    const date = typeof state?.activeLabel === "string" ? state.activeLabel : null;
    const rawPrice = state?.activePayload?.[0]?.value;
    const price = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);

    if (date && Number.isFinite(price)) {
      setSelected({ date, price });
    }
  }

  if (!normalized.length) {
    return <div className="grid h-full place-items-center text-sm text-paper/45">No recorded quotes yet.</div>;
  }

  return (
    <div className="w-full" style={{ height }}>
      {selected ? (
        <div className="mb-1 flex items-center justify-end gap-2 text-xs font-bold number-tabular">
          <span className="text-paper/45">{formatChartDate(selected.date, true)}</span>
          <span>{formatCurrency(selected.price)}</span>
        </div>
      ) : null}
      <div style={{ height: selected ? height - 24 : height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={normalized}
            margin={{ top: 10, right: compact ? 4 : 16, bottom: 0, left: compact ? 4 : 0 }}
            onMouseMove={(state) => selectPoint(state as ChartInteraction)}
            onClick={(state) => selectPoint(state as ChartInteraction)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            {!compact ? <CartesianGrid stroke="rgb(var(--color-line))" strokeOpacity={0.6} vertical={false} /> : null}
            <XAxis
              dataKey="date"
              hide={compact}
              tickFormatter={(value) => formatChartDate(String(value))}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
              tick={{ fill: "rgb(var(--color-paper) / 0.45)", fontSize: 11 }}
            />
            <YAxis
              hide={compact}
              width={58}
              axisLine={false}
              tickLine={false}
              domain={yDomain}
              tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              tick={{ fill: "rgb(var(--color-paper) / 0.45)", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: "rgb(var(--color-paper) / 0.42)", strokeWidth: 1, strokeDasharray: "4 4" }}
              contentStyle={{
                background: "rgb(var(--color-panel))",
                border: "1px solid rgb(var(--color-line))",
                borderRadius: 8,
                color: "rgb(var(--color-paper))",
                boxShadow: "0 12px 30px rgb(0 0 0 / 0.18)",
                fontSize: 12
              }}
              labelFormatter={(value) => formatChartDate(String(value), true)}
              formatter={(value) => [formatCurrency(Number(value)), "RMI quote"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={compact ? 2 : 2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "rgb(var(--color-panel))", fill: color }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
