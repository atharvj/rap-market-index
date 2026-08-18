export function hasMaterialMarketImpact(impactScore: number, minimumImpact: number) {
  return Number.isFinite(impactScore) && Math.abs(impactScore) >= minimumImpact;
}
