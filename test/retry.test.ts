import { describe, expect, it, vi } from "vitest";

import { computeBackoffDelay, sleep } from "../src/internal/retry";

describe("retry utilities", () => {
  it("sleep resolves after requested duration", async () => {
    vi.useFakeTimers();
    const promise = sleep(25);
    vi.advanceTimersByTime(25);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("computeBackoffDelay adds exponential backoff with jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const delay = computeBackoffDelay(2, 100);

    expect(delay).toBe(450);

    vi.restoreAllMocks();
  });
});