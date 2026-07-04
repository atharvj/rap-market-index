"use client";

import { formatCurrency, formatDate } from "@/lib/formatters";
import type { PricePoint } from "@/lib/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export function PriceChart({ data, height = 270 }: { data: PricePoint[]; height?: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
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
            width={58}
            axisLine={false}
            tickLine={false}
            domain={["dataMin - 3", "dataMax + 3"]}
            tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
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
            formatter={(value) => [formatCurrency(Number(value)), "Price"]}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#4ccf94"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0, fill: "#c99a45" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
