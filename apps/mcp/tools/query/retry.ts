interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
}

const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 200, maxDelay = 5_000, jitter = true } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const status = (error as any).status;

      const retriable = status ? RETRYABLE_STATUSES.includes(status) : true;
      if (!retriable || attempt === maxRetries) {
        throw error;
      }

      const base = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const delay = jitter ? base + Math.random() * (base / 2) : base;
      await sleep(delay);
    }
  }

  throw lastError;
}
