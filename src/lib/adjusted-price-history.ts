import type { PricePoint } from "@/lib/types";

export type PriceHistoryAdjustment = {
  effectiveDate: string;
  effectiveAt?: string;
  factor: number;
};

/** Re-express recorded quotes in today's valuation units, without inventing
 * observations or changing their dates/relative movement. Keep raw quotes on
 * every changed point so inspection and trading eligibility use the originals. */
export function adjustPriceHistory(points: PricePoint[], adjustments: PriceHistoryAdjustment[], granularity: "daily" | "intraday" = "daily"): PricePoint[] {
  return points.map(point => {
    const recordedPrice = point.recordedPrice ?? point.price;
    const factor = adjustments.reduce((product, adjustment) => {
      if (!Number.isFinite(adjustment.factor) || adjustment.factor <= 0) return product;
      const before = granularity === "daily"
        ? point.date < adjustment.effectiveDate
        : Boolean(adjustment.effectiveAt && Date.parse(point.date) < Date.parse(adjustment.effectiveAt));
      return before ? product * adjustment.factor : product;
    }, 1);
    return factor === 1 ? { date: point.date, price: recordedPrice }
      : { date: point.date, price: recordedPrice * factor, recordedPrice };
  });
}

export function originalPriceHistory(points: PricePoint[]): PricePoint[] {
  return points.map(point => ({ date: point.date, price: point.recordedPrice ?? point.price }));
}
