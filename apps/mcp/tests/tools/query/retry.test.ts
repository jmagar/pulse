import { describe, expect, it, vi } from "vitest";
import { retryWithBackoff } from "../../../tools/query/retry.js";

describe("retryWithBackoff", () => {
  it("retries on 429 then succeeds", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        const err: any = new Error("Rate limited");
        err.status = 429;
        throw err;
      }
      return "ok";
    });

    const promise = retryWithBackoff(fn, { baseDelay: 10, maxRetries: 3, maxDelay: 20 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("does not retry on non-retriable status", async () => {
    const fn = vi.fn(async () => {
      const err: any = new Error("Not found");
      err.status = 404;
      throw err;
    });

    await expect(retryWithBackoff(fn, { maxRetries: 3 })).rejects.toThrow("Not found");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
