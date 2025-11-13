/**
 * @fileoverview HTTP timeout utilities
 *
 * Provides timeout protection for fetch requests using AbortController.
 *
 * @module shared/clients/firecrawl/utils/timeout
 */

/**
 * Fetch with AbortSignal timeout.
 *
 * Prevents indefinite hangs when API is slow or unresponsive.
 * Uses AbortController for clean cancellation without zombie requests.
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Response promise that rejects on timeout
 * @throws Error with "timeout" message if request exceeds timeoutMs
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}
