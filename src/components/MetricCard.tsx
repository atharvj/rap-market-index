import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  tone?: "neutral" | "good" | "bad" | "warm" | "cool";
}) {
  const toneClass = {
    neutral: "text-paper",
    good: "text-mint",
    bad: "text-ember",
    warm: "text-brass",
    cool: "text-cyan"
  }[tone];

  return (
    <section className="rmi-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-paper/50">{label}</p>
        <div className="text-paper/50">{icon}</div>
      </div>
      <p className={`mt-3 text-2xl font-semibold number-tabular ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-sm text-paper/50">{detail}</p> : null}
    </section>
  );
}
