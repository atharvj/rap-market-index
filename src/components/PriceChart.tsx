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
  const positive = data.length < 2 || data[data.length - 1].price >= data[0].price;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e7ebef" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            axisLine={false}
            tickLine={false}
            minTickGap={22}
            tick={{ fill: "#6b7480", fontSize: 12 }}
          />
          <YAxis
            width={58}
            axisLine={false}
            tickLine={false}
            domain={["dataMin - 3", "dataMax + 3"]}
            tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
            tick={{ fill: "#6b7480", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: "#9aa6b2", strokeWidth: 1 }}
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #d9e0e7",
              borderRadius: 8,
              color: "#1f2933",
              boxShadow: "0 10px 28px rgba(31, 41, 51, 0.1)"
            }}
            labelFormatter={(value) => formatDate(String(value))}
            formatter={(value) => [formatCurrency(Number(value)), "Price"]}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={positive ? "#00856f" : "#d93025"}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0, fill: "#2364c8" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
