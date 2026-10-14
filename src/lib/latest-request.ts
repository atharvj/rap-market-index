// Cancel superseded requests and ignore their completions, even if a transport
// finishes after cancellation. Each coordinator belongs to one mounted effect.
export function createLatestRequest(timeoutMs = 20_000) {
  let generation = 0;
  let disposed = false;
  let active: { controller: AbortController; timer: ReturnType<typeof setTimeout> } | null = null;
  return {
    start() {
      if (active) { clearTimeout(active.timer); active.controller.abort(); }
      const controller = new AbortController();
      const current = ++generation;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      active = { controller, timer };
      return {
        signal: controller.signal,
        isCurrent: () => !disposed && current === generation,
        finish: () => { clearTimeout(timer); if (current === generation) active = null; }
      };
    },
    dispose() {
      disposed = true;
      generation++;
      if (active) { clearTimeout(active.timer); active.controller.abort(); active = null; }
    }
  };
}
