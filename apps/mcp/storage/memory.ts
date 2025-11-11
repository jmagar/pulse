import {
  ResourceStorage,
  ResourceData,
  ResourceContent,
  ResourceMetadata,
  ResourceType,
  MultiResourceWrite,
  MultiResourceUris,
  ResourceCacheStats,
  ResourceCacheOptions,
  ResourceCacheEntry,
} from "./types.js";
import { resolveCacheOptions, ResolvedCacheOptions } from "./cache-options.js";

interface MemoryResourceEntry {
  data: ResourceData;
  content: string;
  size: number;
  createdAt: number;
  lastAccessTime: number;
  ttl: number;
}

export class MemoryResourceStorage implements ResourceStorage {
  private resources: Map<string, MemoryResourceEntry> = new Map();
  private totalSizeBytes = 0;
  private cleanupTimer?: NodeJS.Timeout;
  private options: ResolvedCacheOptions;

  constructor(options: ResourceCacheOptions = {}) {
    this.options = resolveCacheOptions(options);
  }

  startCleanup(): void {
    if (this.cleanupTimer) {
      return;
    }
    this.cleanupTimer = setInterval(() => {
      this.evictExpired();
    }, this.options.cleanupInterval);
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  async list(): Promise<ResourceData[]> {
    this.evictExpired();
    return Array.from(this.resources.values()).map((entry) => entry.data);
  }

  async read(uri: string): Promise<ResourceContent> {
    const entry = this.getEntry(uri);
    if (!entry) {
      throw new Error(`Resource not found: ${uri}`);
    }

    entry.lastAccessTime = Date.now();

    return {
      uri,
      mimeType: entry.data.mimeType,
      text: entry.content,
    };
  }

  async write(
    url: string,
    content: string,
    metadata?: Partial<ResourceMetadata>,
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const resourceType = metadata?.resourceType || "raw";
    const uri = this.generateUri(url, timestamp, resourceType);
    const ttl = this.resolveTtl(metadata);
    const now = Date.now();

    const fullMetadata: ResourceMetadata = {
      ...metadata,
      url,
      timestamp,
      resourceType,
      ttl,
    };

    const resourceData: ResourceData = {
      uri,
      name: this.generateName(url, timestamp, resourceType),
      description: metadata?.description || `Fetched content from ${url}`,
      mimeType: metadata?.contentType || "text/plain",
      metadata: fullMetadata,
    };

    const size = Buffer.byteLength(content, "utf-8");
    const entry: MemoryResourceEntry = {
      data: resourceData,
      content,
      size,
      createdAt: now,
      lastAccessTime: now,
      ttl,
    };

    if (this.resources.has(uri)) {
      this.removeEntry(uri);
    }

    this.resources.set(uri, entry);
    this.totalSizeBytes += size;
    this.enforceLimits();

    return uri;
  }

  async writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris> {
    const uris: MultiResourceUris = {} as MultiResourceUris;

    uris.raw = await this.write(data.url, data.raw, {
      ...data.metadata,
      resourceType: "raw",
    });

    if (data.cleaned) {
      uris.cleaned = await this.write(data.url, data.cleaned, {
        ...data.metadata,
        resourceType: "cleaned",
      });
    }

    if (data.extracted) {
      const extractPrompt = (data.metadata?.extractionPrompt ||
        (data.metadata as Record<string, unknown>)?.extract) as
        | string
        | undefined;

      const { extract: _extract, ...metadataWithoutExtract } = (data.metadata ||
        {}) as Record<string, unknown>;

      uris.extracted = await this.write(data.url, data.extracted, {
        ...metadataWithoutExtract,
        resourceType: "extracted",
        extractionPrompt: extractPrompt,
      });
    }

    return uris;
  }

  async exists(uri: string): Promise<boolean> {
    const entry = this.getEntry(uri);
    if (!entry) {
      return false;
    }
    entry.lastAccessTime = Date.now();
    return true;
  }

  async delete(uri: string): Promise<void> {
    if (!this.resources.has(uri)) {
      throw new Error(`Resource not found: ${uri}`);
    }
    this.removeEntry(uri);
  }

  async findByUrl(url: string): Promise<ResourceData[]> {
    this.evictExpired();
    return Array.from(this.resources.values())
      .filter((entry) => entry.data.metadata.url === url)
      .sort((a, b) => {
        const timeA = new Date(a.data.metadata.timestamp).getTime();
        const timeB = new Date(b.data.metadata.timestamp).getTime();
        return timeB - timeA;
      })
      .map((entry) => entry.data);
  }

  async findByUrlAndExtract(
    url: string,
    extractPrompt?: string,
  ): Promise<ResourceData[]> {
    this.evictExpired();
    return Array.from(this.resources.values())
      .filter((entry) => {
        const matchesUrl = entry.data.metadata.url === url;
        const prompt = entry.data.metadata.extractionPrompt;
        if (!extractPrompt) {
          return matchesUrl && !prompt;
        }
        return matchesUrl && prompt === extractPrompt;
      })
      .sort((a, b) => {
        const timeA = new Date(a.data.metadata.timestamp).getTime();
        const timeB = new Date(b.data.metadata.timestamp).getTime();
        return timeB - timeA;
      })
      .map((entry) => entry.data);
  }

  async getStats(): Promise<ResourceCacheStats> {
    this.evictExpired();
    return this.buildStats();
  }

  getStatsSync(): ResourceCacheStats {
    this.evictExpired();
    return this.buildStats();
  }

  private buildStats(): ResourceCacheStats {
    const resources: ResourceCacheEntry[] = Array.from(
      this.resources.entries(),
    ).map(([uri, entry]) => ({
      uri,
      url: entry.data.metadata.url,
      resourceType: entry.data.metadata.resourceType,
      sizeBytes: entry.size,
      ttl: entry.ttl,
      createdAt: entry.createdAt,
      lastAccessTime: entry.lastAccessTime,
      expiresAt: entry.ttl > 0 ? entry.createdAt + entry.ttl : undefined,
    }));

    return {
      itemCount: this.resources.size,
      totalSizeBytes: this.totalSizeBytes,
      maxItems: this.options.maxItems,
      maxSizeBytes: this.options.maxSizeBytes,
      defaultTTL: this.options.defaultTTL,
      resources,
    };
  }

  private getEntry(uri: string): MemoryResourceEntry | undefined {
    const entry = this.resources.get(uri);
    if (!entry) {
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.removeEntry(uri);
      return undefined;
    }
    return entry;
  }

  private removeEntry(uri: string): void {
    const entry = this.resources.get(uri);
    if (!entry) {
      return;
    }
    this.resources.delete(uri);
    this.totalSizeBytes -= entry.size;
  }

  private resolveTtl(metadata?: Partial<ResourceMetadata>): number {
    const ttl = metadata?.ttl;
    if (ttl === undefined || ttl === null) {
      return this.options.defaultTTL;
    }
    return ttl <= 0 ? 0 : ttl;
  }

  private isExpired(entry: MemoryResourceEntry): boolean {
    return entry.ttl > 0 && Date.now() - entry.createdAt > entry.ttl;
  }

  private evictExpired(): void {
    for (const uri of Array.from(this.resources.keys())) {
      const entry = this.resources.get(uri);
      if (entry && this.isExpired(entry)) {
        this.removeEntry(uri);
      }
    }
  }

  private enforceLimits(): void {
    this.evictExpired();
    while (
      this.resources.size > this.options.maxItems ||
      this.totalSizeBytes > this.options.maxSizeBytes
    ) {
      let oldestUri: string | null = null;
      let oldestTime = Infinity;
      for (const [uri, entry] of this.resources) {
        if (entry.lastAccessTime < oldestTime) {
          oldestUri = uri;
          oldestTime = entry.lastAccessTime;
        }
      }
      if (!oldestUri) {
        break;
      }
      this.removeEntry(oldestUri);
    }
  }

  private generateUri(
    url: string,
    timestamp: string,
    resourceType: ResourceType = "raw",
  ): string {
    const sanitizedUrl = url
      .replace(/^https?:\/\//, "")
      .replace(/[^a-zA-Z0-9.-]/g, "_");
    const timestampPart = timestamp.replace(/[^0-9]/g, "");
    return `memory://${resourceType}/${sanitizedUrl}_${timestampPart}`;
  }

  private generateName(
    url: string,
    timestamp: string,
    resourceType: ResourceType = "raw",
  ): string {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const dateStr = new Date(timestamp).toISOString().split("T")[0];
    return `${resourceType}/${hostname}_${dateStr}`;
  }
}
