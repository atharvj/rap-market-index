import type { HypeStats } from "@/lib/types";

const metrics: Array<{ key: keyof HypeStats; label: string; max: number }> = [
  { key: "streamingGrowth", label: "Streaming", max: 60 },
  { key: "youtubeGrowth", label: "YouTube", max: 60 },
  { key: "searchGrowth", label: "Search", max: 70 },
  { key: "socialGrowth", label: "Social", max: 90 },
  { key: "newsScore", label: "News", max: 100 },
  { key: "traderDemand", label: "Trader demand", max: 40 }
];

export function HypeBars({ stats }: { stats: HypeStats }) {
  return (
    <div className="space-y-3">
      {metrics.map((metric) => {
        const raw = stats[metric.key];
        const normalized =
          metric.key === "traderDemand"
            ? ((raw + metric.max) / (metric.max * 2)) * 100
            : (Math.max(0, raw) / metric.max) * 100;

        return (
          <div key={metric.key}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-paper/65">{metric.label}</span>
              <span className="number-tabular text-paper/55">
                {metric.key === "newsScore" ? raw.toFixed(0) : `${raw > 0 ? "+" : ""}${raw.toFixed(1)}%`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-sm bg-black/35">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-mint via-cyan to-brass opacity-90"
                style={{ width: `${Math.min(100, Math.max(4, normalized))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
