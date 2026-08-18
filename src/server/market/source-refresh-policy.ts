export function shouldCollectWikimediaSource(source: string, intraday: boolean) {
  return !intraday && (
    source === "wikimedia" ||
    source === "core" ||
    source === "blended"
  );
}
