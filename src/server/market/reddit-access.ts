// Credentials do not imply that Reddit approved this application's access.
export function isRedditAccessEnabled(env: Record<string, string | undefined> = process.env) {
  const enabled = (value: string | undefined) => ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
  return enabled(env.MARKET_REDDIT_API_APPROVED) && enabled(env.MARKET_REDDIT_ENABLED);
}
