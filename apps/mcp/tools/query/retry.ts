interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
}

const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = DEFAULT_MAX_RETRIES, baseDelay = DEFAULT_BASE_DELAY_MS, maxDelay = DEFAULT_MAX_DELAY_MS, jitter = true } = options;
  
  // Validate input parameters
  if (maxRetries < 0) {
    throw new TypeError("maxRetries must be non-negative");
  }
  if (baseDelay <= 0 || maxDelay <= 0) {
    throw new TypeError("Delays must be positive");
  }
  
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const errorObj = error as any;
      const status = errorObj.status;

      // Only retry network errors, not programming errors
      const isNetworkError = !status && (
        ['ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND'].includes(errorObj.code) ||
        lastError.name.includes('Timeout') ||
        lastError.name.includes('NetworkError')
      );
      const retriable = status ? RETRYABLE_STATUSES.includes(status) : isNetworkError;
      
      if (!retriable) {
        console.log(`Non-retriable error (status=${status}), not retrying`);
        throw error;
      }
      
      if (attempt === maxRetries) {
        console.error(`Retry exhausted after ${maxRetries + 1} attempts`, { error: lastError });
        throw error;
      }

      const base = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const jittered = jitter ? base + Math.random() * (base / 2) : base;
      const delay = Math.min(jittered, maxDelay);  // Clamp to maxDelay
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Retry exhausted without error");
}
