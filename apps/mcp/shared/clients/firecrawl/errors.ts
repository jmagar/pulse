/**
 * @fileoverview Firecrawl API error categorization
 *
 * Provides structured error handling with user-friendly messages
 * and actionable recommendations for common Firecrawl API errors.
 *
 * @module shared/clients/firecrawl/errors
 */

/**
 * Structured error information for Firecrawl API failures
 *
 * Categorizes errors by type and provides guidance on handling:
 * - auth: Authentication failures (401, 403)
 * - rate_limit: Too many requests (429)
 * - payment: Credits exhausted (402)
 * - validation: Invalid parameters (400, 404)
 * - server: Firecrawl service issues (5xx)
 * - network: Connection problems (ECONNREFUSED, ETIMEDOUT)
 */
export interface FirecrawlError {
  code: number;
  category: 'auth' | 'rate_limit' | 'payment' | 'validation' | 'server' | 'network';
  message: string;
  userMessage: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/**
 * Categorizes Firecrawl API errors into structured error types
 *
 * Parses response body (JSON or plain text) and maps HTTP status codes
 * to user-friendly error categories with actionable messages.
 *
 * @param statusCode - HTTP status code from Firecrawl API response
 * @param responseBody - Response body (JSON or plain text)
 * @returns Structured error information with user guidance
 *
 * @example
 * ```typescript
 * const error = categorizeFirecrawlError(401, '{"error": "Invalid API key"}');
 * console.log(error.userMessage);
 * // "Authentication failed. Please verify your FIRECRAWL_API_KEY is correct and active."
 * ```
 */
export function categorizeFirecrawlError(statusCode: number, responseBody: string): FirecrawlError {
  // Parse error details from response
  let errorMessage = '';
  try {
    const json = JSON.parse(responseBody);
    errorMessage = json.error || json.message || '';
  } catch {
    errorMessage = responseBody;
  }

  // Network errors (connection refused, timeout)
  if (
    statusCode === 0 ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ETIMEDOUT')
  ) {
    return {
      code: statusCode || 0,
      category: 'network',
      message: errorMessage,
      userMessage:
        'Network error connecting to Firecrawl API. Please check your internet connection and verify the API is accessible.',
      retryable: true,
      retryAfterMs: 5000,
    };
  }

  switch (statusCode) {
    case 401:
    case 403:
      return {
        code: statusCode,
        category: 'auth',
        message: errorMessage,
        userMessage:
          'Authentication failed. Please verify your FIRECRAWL_API_KEY is correct and active.',
        retryable: false,
      };

    case 402:
      return {
        code: 402,
        category: 'payment',
        message: errorMessage,
        userMessage:
          'Payment required. Your Firecrawl account credits may be exhausted or plan upgrade needed. Visit https://firecrawl.dev/billing',
        retryable: false,
      };

    case 429:
      return {
        code: 429,
        category: 'rate_limit',
        message: errorMessage,
        userMessage: 'Rate limit exceeded. Please wait 60 seconds before retrying.',
        retryable: true,
        retryAfterMs: 60000,
      };

    case 400:
    case 404:
      return {
        code: statusCode,
        category: 'validation',
        message: errorMessage,
        userMessage: `Invalid request parameters: ${errorMessage}`,
        retryable: false,
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        code: statusCode,
        category: 'server',
        message: errorMessage,
        userMessage:
          'Firecrawl server error. This is usually temporary - please retry in a few moments.',
        retryable: true,
        retryAfterMs: 5000,
      };

    default:
      return {
        code: statusCode,
        category: 'network',
        message: errorMessage,
        userMessage: `Firecrawl API error (${statusCode}): ${errorMessage || 'Unknown error'}`,
        retryable: statusCode >= 500,
        retryAfterMs: statusCode >= 500 ? 5000 : undefined,
      };
  }
}
