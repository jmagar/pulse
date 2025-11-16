import {
  ResourceStorage,
  ResourceData,
  ResourceContent,
  ResourceMetadata,
  MultiResourceWrite,
  MultiResourceUris,
  ResourceCacheStats,
} from "./types.js";

export interface WebhookPostgresConfig {
  webhookBaseUrl: string;
  apiSecret: string;
  defaultTtl?: number;
}

export class WebhookPostgresStorage implements ResourceStorage {
  private webhookBaseUrl: string;
  private apiSecret: string;
  private defaultTtl: number;

  constructor(config: WebhookPostgresConfig) {
    this.webhookBaseUrl = config.webhookBaseUrl;
    this.apiSecret = config.apiSecret;
    this.defaultTtl = config.defaultTtl ?? 3600000; // 1 hour default
  }

  async list(): Promise<ResourceData[]> {
    // Webhook API doesn't expose list operation
    throw new Error("list not supported by webhook storage");
  }

  async read(uri: string): Promise<ResourceContent> {
    // Parse URI format: webhook://{id}
    const match = uri.match(/^webhook:\/\/(\d+)$/);
    if (!match) {
      throw new Error(`Invalid URI format: ${uri}`);
    }

    const contentId = match[1];
    const apiUrl = `${this.webhookBaseUrl}/api/content/${contentId}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          "Authorization": `Bearer ${this.apiSecret}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Resource not found: ${uri}`);
        }
        throw new Error(`Webhook API error: ${response.status}`);
      }

      const content = await response.json();

      return {
        uri,
        mimeType: "text/markdown",
        text: content.markdown || "",
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to read resource: ${uri}`);
    }
  }

  async write(
    _url: string,
    _content: string,
    _metadata?: Partial<ResourceMetadata>,
  ): Promise<string> {
    throw new Error("Not implemented");
  }

  async writeMulti(_data: MultiResourceWrite): Promise<MultiResourceUris> {
    // Webhook API doesn't have a /api/content/store endpoint yet
    // Write operations happen via Firecrawl → webhook pipeline, not directly via MCP
    throw new Error(
      "writeMulti not supported - webhook storage is read-only. " +
        "Content is written via the Firecrawl → webhook pipeline.",
    );
  }

  async exists(uri: string): Promise<boolean> {
    // Try to read URI, return true if successful, false if 404
    try {
      await this.read(uri);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Resource not found")) {
        return false;
      }
      // Re-throw other errors (like invalid URI format)
      throw error;
    }
  }

  async delete(_uri: string): Promise<void> {
    // Webhook API doesn't expose delete operation
    throw new Error("delete not supported by webhook storage");
  }

  async findByUrl(url: string): Promise<ResourceData[]> {
    const encodedUrl = encodeURIComponent(url);
    const apiUrl = `${this.webhookBaseUrl}/api/content/by-url?url=${encodedUrl}&limit=10`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          "Authorization": `Bearer ${this.apiSecret}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        throw new Error(`Webhook API error: ${response.status}`);
      }

      const contentList = await response.json();
      return this.transformToResourceData(contentList);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return [];
      }
      throw error;
    }
  }

  private transformToResourceData(
    contentList: Array<{
      id: number;
      url: string;
      markdown?: string;
      html?: string;
      links?: string[];
      screenshot?: string | null;
      metadata?: Record<string, unknown>;
      content_source?: string;
      scraped_at?: string;
      created_at?: string;
      crawl_session_id?: string | null;
    }>,
  ): ResourceData[] {
    return contentList.map((content) => {
      const uri = `webhook://${content.id}`;
      const timestamp = content.scraped_at || content.created_at || new Date().toISOString();

      return {
        uri,
        name: new URL(content.url).hostname,
        description: `Content from ${content.url}`,
        mimeType: "text/markdown",
        metadata: {
          url: content.url,
          timestamp,
          resourceType: "cleaned" as const,
          contentType: "text/markdown",
          ttl: this.defaultTtl,
        },
      };
    });
  }

  async findByUrlAndExtract(
    url: string,
    _extractPrompt?: string,
  ): Promise<ResourceData[]> {
    // Webhook API doesn't support extraction prompt filtering
    // Webhook markdown content represents the "cleaned" tier
    // Implementation: Call findByUrl() and return results
    // The extractPrompt parameter is ignored since webhook doesn't store raw/cleaned/extracted tiers separately
    return this.findByUrl(url);
  }

  async getStats(): Promise<ResourceCacheStats> {
    // Webhook API doesn't expose stats operation
    throw new Error("stats not supported by webhook storage");
  }

  getStatsSync(): ResourceCacheStats {
    // Webhook API doesn't expose stats operation
    throw new Error("stats not supported by webhook storage");
  }

  startCleanup(): void {
    // No-op for webhook backend
  }

  stopCleanup(): void {
    // No-op for webhook backend
  }
}
