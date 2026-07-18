import type { PricePoint } from "@/lib/types";

export function MiniSparkline({
  data,
  positive,
  width = 116,
  height = 34
}: {
  data: PricePoint[];
  positive: boolean;
  width?: number;
  height?: number;
}) {
  const points = data.slice(-18);

  if (points.length < 2) {
    return (
      <div
        className="relative overflow-hidden rounded-sm border border-line/60 bg-panelSoft/70"
        style={{ width, height }}
        aria-label="Price history is still building"
      >
        <span className="absolute inset-x-2 top-1/2 h-px bg-paper/12" />
      </div>
    );
  }

  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(0.01, max - min);
  const step = width / Math.max(1, points.length - 1);
  const coordinates = points.map((point, index) => {
    const x = index * step;
    const y = height - ((point.price - min) / range) * (height - 4) - 2;

    return { x, y };
  });
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const last = coordinates[coordinates.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={positive ? "overflow-visible text-mint" : "overflow-visible text-ember"}
      role="img"
      aria-label="Recent price trend"
    >
      <path d={path} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="6" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.1" />
      <circle cx={last.x} cy={last.y} r="2.6" fill="currentColor" />
    </svg>
  );
}
