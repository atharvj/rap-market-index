import { formatPercent } from "@/lib/formatters";
import { TrendingDown, TrendingUp } from "lucide-react";

export function ChangePill({ value }: { value: number }) {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span
      className={`inline-flex min-w-24 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs font-bold number-tabular ${
        positive
          ? "border-mint/25 bg-mint/[0.08] text-mint"
          : "border-ember/25 bg-ember/[0.08] text-ember"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {formatPercent(value)}
    </span>
  );
}
