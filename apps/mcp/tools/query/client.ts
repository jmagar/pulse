import type { QueryOptions } from "./schema.js";

interface QueryClientConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

interface SearchResult {
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
    const url = `${this.baseUrl}/api/search`;

    const offset = options.offset ?? 0;
    const perPage = options.limit;
    const fetchLimit = Math.min(100, offset + perPage);

    const requestBody = {
      query: options.query,
      mode: options.mode,
      limit: fetchLimit,
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
      throw new Error(
        `Query failed: ${response.status} ${response.statusText}${
          errorBody.detail ? ` - ${errorBody.detail}` : ""
        }`,
      );
    }

    const payload = await response.json();
    const trimmedResults = Array.isArray(payload.results)
      ? payload.results.slice(offset)
      : [];

    return {
      ...payload,
      results: trimmedResults,
      offset,
    };
  }
}
