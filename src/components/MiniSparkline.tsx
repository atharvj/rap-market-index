import type { PricePoint } from "@/lib/types";
import { buildSparklinePath } from "@/lib/sparkline";

export function MiniSparkline({
  data,
  positive,
  width = 116,
  height = 34,
  label = "Recent recorded price trend",
  interpolation = "linear"
}: {
  data: PricePoint[];
  positive: boolean;
  width?: number;
  height?: number;
  label?: string;
  interpolation?: "linear" | "step";
}) {
  const points = data;

  if (points.length < 2) {
    return (
      <div
        className="relative overflow-hidden rounded-sm border border-line/60 bg-panelSoft/70"
        style={{ width, height }}
        aria-label={`${label}; price history is still building`}
      >
        <span className="absolute inset-x-2 top-1/2 h-px bg-paper/12" />
      </div>
    );
  }

  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const timestamps = points.map((point) => new Date(point.date).getTime());
  const useTimeScale = timestamps.every(Number.isFinite) && timestamps[timestamps.length - 1] > timestamps[0];
  const timeRange = useTimeScale ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const step = width / Math.max(1, points.length - 1);
  const coordinates = points.map((point, index) => {
    const x = useTimeScale
      ? ((timestamps[index] - timestamps[0]) / timeRange) * width
      : index * step;
    const y = range <= 0
      ? height / 2
      : height - ((point.price - min) / range) * (height - 4) - 2;

    return { x, y };
  });
  const path = buildSparklinePath(coordinates, interpolation);
  const last = coordinates[coordinates.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={positive ? "overflow-visible text-mint" : "overflow-visible text-ember"}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path d={path} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="5" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx={last.x} cy={last.y} r="2.6" fill="currentColor" />
    </svg>
  );
}
