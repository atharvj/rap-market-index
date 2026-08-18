"use client";

import { InfoTooltip } from "@/components/InfoTooltip";

const EXPLANATION = "Your average price paid per share. Buys can fill slightly above the chart price.";

export function AverageFillInfo({
  align = "left",
  className
}: {
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <InfoTooltip label="Explain average fill price" align={align} className={className}>
      {EXPLANATION}
    </InfoTooltip>
  );
}
