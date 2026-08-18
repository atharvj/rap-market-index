"use client";

import { InfoTooltip } from "@/components/InfoTooltip";
import { MARKET_MOMENTUM_EXPLANATION } from "@/lib/artist-explanations";

export function MomentumInfo({ className }: { className?: string }) {
  return (
    <InfoTooltip label="Explain RMI Momentum" align="right" className={className} width={288}>
      {MARKET_MOMENTUM_EXPLANATION}
    </InfoTooltip>
  );
}
