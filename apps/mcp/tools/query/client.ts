import type { QueryOptions } from "./schema.js";
import { retryWithBackoff } from "./retry.js";

interface QueryClientConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

interface SearchResult {
  id?: string | number;
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  mode: string;
  offset: number;
}

interface HttpError extends Error {
  status?: number;
}

/**
 * HTTP client for webhook service search endpoint
 */
export class QueryClient {
  private baseUrl: string;
  private apiSecret: string;
  private timeout: number;

  constructor(config: QueryClientConfig) {
    this.baseUrl = config.baseUrl;
    this.apiSecret = config.apiSecret;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Execute search query against webhook service
   */
  async query(options: QueryOptions): Promise<SearchResponse> {
    return retryWithBackoff(async () => {
      const url = `${this.baseUrl}/api/search`;

      const requestBody = {
        query: options.query,
        mode: options.mode,
        limit: options.limit,
        offset: options.offset ?? 0,
        ...(options.filters && { filters: options.filters }),
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiSecret}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const err = new Error(
          `Query failed: ${response.status} ${response.statusText}${
            errorBody.detail ? ` - ${errorBody.detail}` : ""
          }`,
        ) as HttpError;
        err.status = response.status;
        throw err;
      }

      const payload = await response.json();

      return {
        ...payload,
        offset: options.offset ?? 0,
      };
    });
  }
}
