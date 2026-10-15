const CHART_KEYS = ["us", "gb", "ca", "us:albums", "gb:albums", "ca:albums"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// Retain actual evidence from the same market date when a later partial scan
// loses a country. The provider timestamp travels with each retained key.
// This snapshot is storage context, never an extra current pricing observation.
export function mergeSameDayAppleSnapshots(newest: Record<string, unknown>, saved: Record<string, unknown> | undefined) {
  if (!saved || typeof newest.runDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(newest.runDate) ||
    !Number.isFinite(Date.parse(newest.runDate)) || saved.runDate !== newest.runDate) return newest;
  const scores = { ...record(newest.scores) }, updated = { ...record(newest.chartUpdatedAt) };
  const savedScores = record(saved.scores), savedUpdated = record(saved.chartUpdatedAt);
  const retained = new Set(Array.isArray(newest.retainedKeys) ? newest.retainedKeys.filter((key): key is string => typeof key === "string") : []);
  const copied = new Set<string>();
  for (const key of CHART_KEYS) {
    const value = savedScores[key], stamp = savedUpdated[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || typeof stamp !== "string" || !Number.isFinite(Date.parse(stamp))) continue;
    const currentStamp = typeof updated[key] === "string" ? Date.parse(updated[key] as string) : NaN;
    if (typeof scores[key] === "number" && Number.isFinite(scores[key]) && Number.isFinite(currentStamp) && currentStamp >= Date.parse(stamp)) continue;
    scores[key] = value; updated[key] = stamp; retained.add(key); copied.add(key);
  }
  if (!retained.size) return newest;
  const entries = (payload: Record<string, unknown>, key: string) => Array.isArray(payload[key])
    ? (payload[key] as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).storefront === "string") : [];
  const mergeEntries = (key: "tracks" | "albums") => {
    const suffix = key === "albums" ? ":albums" : "";
    return [...entries(newest, key).filter(item => !copied.has(`${item.storefront}${suffix}`)),
      ...entries(saved, key).filter(item => copied.has(`${item.storefront}${suffix}`))];
  };
  const missing = Array.isArray(newest.missingKeys) ? newest.missingKeys.filter((key): key is string => typeof key === "string") : [];
  return { ...newest, scores, chartUpdatedAt: updated, tracks: mergeEntries("tracks"), albums: mergeEntries("albums"),
    retainedKeys: [...retained], missingKeys: [...new Set([...missing, ...retained])] };
}
