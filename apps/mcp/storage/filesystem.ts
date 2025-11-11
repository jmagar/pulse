import {
  ResourceStorage,
  ResourceData,
  ResourceContent,
  ResourceMetadata,
  ResourceType,
  MultiResourceWrite,
  MultiResourceUris,
  ResourceCacheOptions,
  ResourceCacheStats,
  ResourceCacheEntry,
} from "./types.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { resolveCacheOptions, ResolvedCacheOptions } from "./cache-options.js";

interface FileResourceEntry {
  data: ResourceData;
  path: string;
  size: number;
  ttl: number;
  createdAt: number;
  lastAccessTime: number;
}

export class FileSystemResourceStorage implements ResourceStorage {
  private rootDir: string;
  private initialized = false;
  private options: ResolvedCacheOptions;
  private entries: Map<string, FileResourceEntry> = new Map();
  private totalSizeBytes = 0;
  private cleanupTimer?: NodeJS.Timeout;
  private indexLoaded = false;

  constructor(rootDir?: string, options: ResourceCacheOptions = {}) {
    this.rootDir = rootDir || path.join(os.tmpdir(), "pulse", "resources");
    this.options = resolveCacheOptions(options);
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await fs.mkdir(this.rootDir, { recursive: true });
    for (const subdir of ["raw", "cleaned", "extracted"] as ResourceType[]) {
      await fs.mkdir(path.join(this.rootDir, subdir), { recursive: true });
    }

    this.initialized = true;
    await this.refreshIndex();
  }

  startCleanup(): void {
    if (this.cleanupTimer) {
      return;
    }
    this.cleanupTimer = setInterval(() => {
      void this.evictExpired();
    }, this.options.cleanupInterval);
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  async list(): Promise<ResourceData[]> {
    await this.ensureReady();
    await this.evictExpired();
    return Array.from(this.entries.values()).map((entry) => entry.data);
  }

  async read(uri: string): Promise<ResourceContent> {
    const entry = await this.ensureEntry(uri);
    if (!entry) {
      throw new Error(`Resource not found: ${uri}`);
    }

    entry.lastAccessTime = Date.now();
    const content = await fs.readFile(entry.path, "utf-8");
    const { metadata, body } = this.parseMarkdownFile(content);

    return {
      uri,
      mimeType: metadata.contentType || "text/plain",
      text: body,
    };
  }

  async write(
    url: string,
    content: string,
    metadata?: Partial<ResourceMetadata>,
  ): Promise<string> {
    await this.ensureReady();

    const timestamp = new Date().toISOString();
    const resourceType = metadata?.resourceType || "raw";
    const fileName = this.generateFileName(url, timestamp);
    const filePath = path.join(this.rootDir, resourceType, fileName);

    const uri = await this.writeToDisk({
      url,
      content,
      metadata,
      resourceType,
      filePath,
      timestamp,
    });

    await this.enforceLimits();
    return uri;
  }

  async writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris> {
    await this.ensureReady();

    const timestamp = new Date().toISOString();
    const fileName = this.generateFileName(data.url, timestamp);
    const uris: MultiResourceUris = {} as MultiResourceUris;

    uris.raw = await this.writeToDisk({
      url: data.url,
      content: data.raw,
      metadata: { ...data.metadata, resourceType: "raw" },
      resourceType: "raw",
      filePath: path.join(this.rootDir, "raw", fileName),
      timestamp,
    });

    if (data.cleaned) {
      uris.cleaned = await this.writeToDisk({
        url: data.url,
        content: data.cleaned,
        metadata: { ...data.metadata, resourceType: "cleaned" },
        resourceType: "cleaned",
        filePath: path.join(this.rootDir, "cleaned", fileName),
        timestamp,
      });
    }

    if (data.extracted) {
      const extractPrompt = (data.metadata?.extractionPrompt ||
        (data.metadata as Record<string, unknown>)?.extract) as
        | string
        | undefined;

      const { extract: _extract, ...metadataWithoutExtract } = (data.metadata ||
        {}) as Record<string, unknown>;

      uris.extracted = await this.writeToDisk({
        url: data.url,
        content: data.extracted,
        metadata: {
          ...metadataWithoutExtract,
          resourceType: "extracted",
          extractionPrompt: extractPrompt,
        },
        resourceType: "extracted",
        filePath: path.join(this.rootDir, "extracted", fileName),
        timestamp,
      });
    }

    await this.enforceLimits();
    return uris;
  }

  async exists(uri: string): Promise<boolean> {
    const entry = await this.ensureEntry(uri);
    if (!entry) {
      return false;
    }
    entry.lastAccessTime = Date.now();
    return true;
  }

  async delete(uri: string): Promise<void> {
    await this.ensureReady();
    const entry = await this.ensureEntry(uri);
    if (!entry) {
      throw new Error(`Resource not found: ${uri}`);
    }
    await this.removeEntry(uri);
  }

  async findByUrl(url: string): Promise<ResourceData[]> {
    await this.ensureReady();
    await this.evictExpired();
    return Array.from(this.entries.values())
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
    await this.ensureReady();
    await this.evictExpired();
    return Array.from(this.entries.values())
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
    await this.ensureReady();
    await this.evictExpired();
    return this.buildStats();
  }

  private buildStats(): ResourceCacheStats {
    const resources: ResourceCacheEntry[] = Array.from(
      this.entries.entries(),
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
      itemCount: this.entries.size,
      totalSizeBytes: this.totalSizeBytes,
      maxItems: this.options.maxItems,
      maxSizeBytes: this.options.maxSizeBytes,
      defaultTTL: this.options.defaultTTL,
      resources,
    };
  }

  private async ensureReady(): Promise<void> {
    await this.init();
    if (!this.indexLoaded) {
      await this.refreshIndex();
    }
  }

  private async ensureEntry(
    uri: string,
  ): Promise<FileResourceEntry | undefined> {
    let entry = this.entries.get(uri);
    if (!entry) {
      await this.refreshIndex();
      entry = this.entries.get(uri);
    }

    if (!entry) {
      const filePath = this.uriToFilePath(uri);
      if (await this.fileExists(filePath)) {
        const content = await fs.readFile(filePath, "utf-8");
        const { metadata } = this.parseMarkdownFile(content);
        const resourceType = (metadata.resourceType as ResourceType) || "raw";
        const ttl = this.resolveTtl(metadata);
        const resourceData = this.buildResourceData(
          metadata,
          resourceType,
          filePath,
        );
        const newEntry: FileResourceEntry = {
          data: resourceData,
          path: filePath,
          size: Buffer.byteLength(content, "utf-8"),
          ttl,
          createdAt: new Date(
            metadata.timestamp || new Date().toISOString(),
          ).getTime(),
          lastAccessTime: Date.now(),
        };
        this.registerEntry(uri, newEntry);
        entry = newEntry;
      }
    }

    if (!entry) {
      return undefined;
    }

    if (this.isExpired(entry)) {
      await this.removeEntry(uri);
      return undefined;
    }

    return entry;
  }

  private async refreshIndex(): Promise<void> {
    this.entries.clear();
    this.totalSizeBytes = 0;
    const subdirs: ResourceType[] = ["raw", "cleaned", "extracted"];

    for (const subdir of subdirs) {
      const subdirPath = path.join(this.rootDir, subdir);
      let files: string[] = [];
      try {
        files = await fs.readdir(subdirPath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".md")) {
          continue;
        }
        const filePath = path.join(subdirPath, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const { metadata } = this.parseMarkdownFile(content);
          const ttl = this.resolveTtl(metadata);
          const resourceData = this.buildResourceData(
            metadata,
            subdir,
            filePath,
          );
          const entry: FileResourceEntry = {
            data: resourceData,
            path: filePath,
            size: Buffer.byteLength(content, "utf-8"),
            ttl,
            createdAt: new Date(
              metadata.timestamp || new Date().toISOString(),
            ).getTime(),
            lastAccessTime: Date.now(),
          };
          this.registerEntry(`file://${filePath}`, entry);
        } catch {
          continue;
        }
      }
    }

    this.indexLoaded = true;
  }

  private async writeToDisk(options: {
    url: string;
    content: string;
    metadata?: Partial<ResourceMetadata>;
    resourceType: ResourceType;
    filePath: string;
    timestamp: string;
  }): Promise<string> {
    const { url, content, metadata, resourceType, filePath, timestamp } =
      options;
    const ttl = this.resolveTtl(metadata);
    const fullMetadata: ResourceMetadata = {
      ...metadata,
      url,
      timestamp,
      resourceType,
      ttl,
    };

    const markdownContent = this.createMarkdownFile(fullMetadata, content);
    await fs.writeFile(filePath, markdownContent, "utf-8");

    const uri = `file://${filePath}`;
    const resourceData = this.buildResourceData(
      fullMetadata,
      resourceType,
      filePath,
    );
    const entry: FileResourceEntry = {
      data: resourceData,
      path: filePath,
      size: Buffer.byteLength(markdownContent, "utf-8"),
      ttl,
      createdAt: new Date(timestamp).getTime(),
      lastAccessTime: Date.now(),
    };

    this.registerEntry(uri, entry);
    return uri;
  }

  private registerEntry(uri: string, entry: FileResourceEntry): void {
    const existing = this.entries.get(uri);
    if (existing) {
      this.totalSizeBytes -= existing.size;
    }
    this.entries.set(uri, entry);
    this.totalSizeBytes += entry.size;
  }

  private async removeEntry(uri: string): Promise<void> {
    const entry = this.entries.get(uri);
    if (!entry) {
      return;
    }
    this.entries.delete(uri);
    this.totalSizeBytes -= entry.size;
    await fs.rm(entry.path, { force: true });
  }

  private async enforceLimits(): Promise<void> {
    await this.evictExpired();
    while (
      this.entries.size > this.options.maxItems ||
      this.totalSizeBytes > this.options.maxSizeBytes
    ) {
      const lruUri = this.findLeastRecentlyUsed();
      if (!lruUri) {
        break;
      }
      await this.removeEntry(lruUri);
    }
  }

  private findLeastRecentlyUsed(): string | null {
    let oldestUri: string | null = null;
    let oldestTime = Infinity;
    for (const [uri, entry] of this.entries) {
      if (entry.lastAccessTime < oldestTime) {
        oldestUri = uri;
        oldestTime = entry.lastAccessTime;
      }
    }
    return oldestUri;
  }

  private async evictExpired(): Promise<void> {
    for (const uri of Array.from(this.entries.keys())) {
      const entry = this.entries.get(uri);
      if (entry && this.isExpired(entry)) {
        await this.removeEntry(uri);
      }
    }
  }

  private resolveTtl(metadata?: Partial<ResourceMetadata>): number {
    const ttl = metadata?.ttl;
    if (ttl === undefined || ttl === null) {
      return this.options.defaultTTL;
    }
    return ttl <= 0 ? 0 : ttl;
  }

  private isExpired(entry: FileResourceEntry): boolean {
    return entry.ttl > 0 && Date.now() - entry.createdAt > entry.ttl;
  }

  private createMarkdownFile(
    metadata: ResourceMetadata,
    content: string,
  ): string {
    const metadataYaml = Object.entries(metadata)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");

    return `---
${metadataYaml}
---

${content}`;
  }

  private parseMarkdownFile(content: string): {
    metadata: ResourceMetadata;
    body: string;
  } {
    const metadataRegex = /^---\n([\s\S]*?)\n---\n/;
    const match = content.match(metadataRegex);

    if (!match) {
      throw new Error("Invalid markdown file format");
    }

    const metadataStr = match[1];
    const body = content.substring(match[0].length).trimStart();

    const metadata: ResourceMetadata = {
      url: "",
      timestamp: "",
    };

    metadataStr.split("\n").forEach((line) => {
      const [key, ...valueParts] = line.split(": ");
      if (key && valueParts.length > 0) {
        try {
          metadata[key] = JSON.parse(valueParts.join(": "));
        } catch {
          metadata[key] = valueParts.join(": ");
        }
      }
    });

    return { metadata, body };
  }

  private generateFileName(url: string, timestamp: string): string {
    const sanitizedUrl = url
      .replace(/^https?:\/\//, "")
      .replace(/[^a-zA-Z0-9.-]/g, "_");
    const timestampPart = timestamp.replace(/[^0-9]/g, "");
    return `${sanitizedUrl}_${timestampPart}.md`;
  }

  private buildResourceData(
    metadata: ResourceMetadata,
    resourceType: ResourceType,
    filePath: string,
  ): ResourceData {
    const fileName = path.basename(filePath, ".md");
    return {
      uri: `file://${filePath}`,
      name: `${resourceType}/${fileName}`,
      description:
        metadata.description || `Fetched content from ${metadata.url}`,
      mimeType: metadata.contentType || "text/plain",
      metadata: { ...metadata, resourceType },
    };
  }

  private uriToFilePath(uri: string): string {
    if (!uri.startsWith("file://")) {
      throw new Error("Invalid file URI");
    }
    return uri.replace("file://", "");
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
