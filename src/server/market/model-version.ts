export const DEFAULT_MARKET_MODEL_VERSION = "rmi-core-v25";

const AUDIENCE_SCALE_REBASE_VERSION = 24;

export function getMarketModelVersion() {
  const value = process.env.MARKET_MODEL_VERSION?.trim();

  return value || DEFAULT_MARKET_MODEL_VERSION;
}

export function shouldRebaseAudienceValuation(previousVersion: string | null, currentVersion: string) {
  const previous = getCoreVersionNumber(previousVersion);
  const current = getCoreVersionNumber(currentVersion);

  return previous !== null && current !== null && previous < AUDIENCE_SCALE_REBASE_VERSION && current >= AUDIENCE_SCALE_REBASE_VERSION;
}

function getCoreVersionNumber(value: string | null) {
  const match = value?.match(/^rmi-core-v(\d+)$/i);

  return match ? Number(match[1]) : null;
}
