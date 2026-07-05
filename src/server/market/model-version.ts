export const DEFAULT_MARKET_MODEL_VERSION = "rmi-core-v3";

export function getMarketModelVersion() {
  const value = process.env.MARKET_MODEL_VERSION?.trim();

  return value || DEFAULT_MARKET_MODEL_VERSION;
}
