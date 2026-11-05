/** A production configuration error must never turn a real market into demo data. */
export function allowDemoMarket() {
  return process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
}

export const MARKET_ERROR_HEADERS = { "Cache-Control": "no-store" };
