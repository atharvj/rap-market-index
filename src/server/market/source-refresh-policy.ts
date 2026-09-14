export function shouldCollectWikimediaSource(source: string, intraday: boolean) {
  return !intraday && (
    source === "wikimedia" ||
    source === "core" ||
    source === "blended"
  );
}

/** Discover new uploads hourly; audience counters may refresh more frequently. */
export function isVideoDiscoveryDue(lastObservedAt?: string, now = Date.now()) {
  const last = lastObservedAt ? Date.parse(lastObservedAt) : NaN;
  return !Number.isFinite(last) || now - last >= 60 * 60 * 1000;
}
