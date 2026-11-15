/** Context exclusions apply to every artist and publisher, including stored rows. */
export function getNonCatalystArticleReason(text: string) {
  const title = text.toLowerCase().replace(/[’‘]/g, "'");
  const shopping =
    /\b(?:get|buy|shop|order|pre-order|preorder|grab|purchase)\b/.test(title);
  const merchandise =
    /\b(?:signed (?:copy|copies|vinyl|cd)|autographed|beanie|merch(?:andise)?|hoodie|t-shirt|discount|promo code)\b/.test(
      title,
    );
  const measuredSales =
    /\b(?:sold out|sells out|sold \d|sells \d|sales (?:rise|jump|surge|fall)|record sales)\b/.test(
      title,
    );
  if (shopping && merchandise && !measuredSales) return "commerce_promotion";
  const measuredChartResult =
    /\b(?:debuts?|reaches?|tops?|scores?|lands?|climbs? to|falls? from|drops? from)\b.{0,45}\b(?:no\.?\s*\d+|number (?:one|\d+)|top \d+)\b/.test(
      title,
    );
  const chartPolicy =
    !measuredChartResult &&
    /\b(?:billboard|charts?)\b/.test(title) &&
    /\b(?:(?:chart|streaming|stream) (?:rules?|methodology|formula|policy|weighting)|(?:new|changes? (?:its|the)) (?:rules?|methodology|formula)|count(?:s|ing|ed)? (?:streams|streaming)|youtube.{0,40}return|return.{0,40}youtube)\b/.test(
      title,
    );
  if (chartPolicy) return "chart_policy_commentary";
  const unbookedLineupReaction = /\b(?:reacts?|responds?|comments?|weighs? in|slams?)\b/.test(title) &&
    /\blineup\b/.test(title) && /\b(?:doesn'?t feature|does not feature|not featured|doesn'?t include|without (?:him|her|them))\b/.test(title) &&
    !/\b(?:cancels?|cancelled|canceled|withdraws?|removed|dropped from)\b/.test(title);
  if (unbookedLineupReaction) return "lineup_commentary";
  return null;
}
