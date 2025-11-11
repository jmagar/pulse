export interface ResourceMetadata {
  url: string;
  timestamp: string;
  contentType?: string;
  title?: string;
  description?: string;
  resourceType?: ResourceType;
  extractionPrompt?: string;
  ttl?: number;
  [key: string]: unknown;
}

export interface ResourceData {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  metadata: ResourceMetadata;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export type ResourceType = "raw" | "cleaned" | "extracted";

export interface MultiResourceWrite {
  url: string;
  raw: string;
  cleaned?: string;
  extracted?: string;
  metadata?: Partial<ResourceMetadata>;
}

export interface MultiResourceUris {
  raw: string;
  cleaned?: string;
  extracted?: string;
}

export interface ResourceCacheOptions {
  defaultTTL?: number;
  maxItems?: number;
  maxSizeBytes?: number;
  cleanupInterval?: number;
}

export interface ResourceCacheEntry {
  uri: string;
  url: string;
  resourceType?: ResourceType;
  sizeBytes: number;
  ttl: number;
  createdAt: number;
  lastAccessTime: number;
  expiresAt?: number;
}

export interface ResourceCacheStats {
  itemCount: number;
  totalSizeBytes: number;
  maxItems: number;
  maxSizeBytes: number;
  defaultTTL: number;
  resources: ResourceCacheEntry[];
}

export interface ResourceStorage {
  list(): Promise<ResourceData[]>;
  read(uri: string): Promise<ResourceContent>;
  write(
    url: string,
    content: string,
    metadata?: Partial<ResourceMetadata>,
  ): Promise<string>;
  writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris>;
  exists(uri: string): Promise<boolean>;
  delete(uri: string): Promise<void>;
  findByUrl(url: string): Promise<ResourceData[]>;
  findByUrlAndExtract(
    url: string,
    extractPrompt?: string,
  ): Promise<ResourceData[]>;
  getStats(): Promise<ResourceCacheStats>;
  startCleanup(): void;
  stopCleanup(): void;
}
