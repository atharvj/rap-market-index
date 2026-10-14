import { afterEach, describe, expect, it, vi } from "vitest";
import { createLatestRequest } from "@/lib/latest-request";
afterEach(() => vi.useRealTimers());
describe("refresh response ordering", () => {
  it("ignores and cancels an older response after a new request starts", () => {
    const requests = createLatestRequest();
    const older = requests.start(), newer = requests.start();
    expect(older.signal.aborted).toBe(true);
    expect(older.isCurrent()).toBe(false);
    expect(newer.isCurrent()).toBe(true);
    older.finish();
    expect(newer.isCurrent()).toBe(true);
    requests.dispose();
  });
  it("cancels the active request and prevents updates after unmount", () => {
    const requests = createLatestRequest();const request = requests.start();
    requests.dispose();
    expect(request.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(false);
  });
  it("times out a hung current request while allowing its failure state to be reported", () => {
    vi.useFakeTimers();const requests = createLatestRequest(1000), request = requests.start();
    vi.advanceTimersByTime(1000);
    expect(request.signal.aborted).toBe(true);expect(request.isCurrent()).toBe(true);
    request.finish();requests.dispose();
  });
});
