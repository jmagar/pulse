import type { CrawlMetricsResponse } from "./types.js";

export interface ProfileConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

/**
 * HTTP client for webhook metrics API
 */
export class ProfileClient {
  private baseUrl: string;
  private apiSecret: string;
  private timeout: number;

  constructor(config: ProfileConfig) {
    this.baseUrl = config.baseUrl;
    this.apiSecret = config.apiSecret;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Get crawl metrics from webhook API
   *
   * @param crawl_id - Firecrawl crawl/job identifier
   * @param include_per_page - Whether to include per-page operation details
   * @returns Crawl metrics response
   * @throws Error if crawl not found, authentication fails, or API error occurs
   */
  async getMetrics(
    crawl_id: string,
    include_per_page: boolean = false
  ): Promise<CrawlMetricsResponse> {
    const url = `${this.baseUrl}/api/metrics/crawls/${crawl_id}`;
    const params = include_per_page ? "?include_per_page=true" : "";

    const response = await fetch(`${url}${params}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiSecret}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Crawl not found: ${crawl_id}. The crawl may not have started yet, ` +
          `or the crawl_id may be invalid.`
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("Authentication failed: Invalid API secret");
      }

      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Metrics API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }
}
