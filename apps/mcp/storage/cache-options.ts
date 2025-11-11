import { ResourceCacheOptions } from "./types.js";

export type ResolvedCacheOptions = Required<ResourceCacheOptions>;

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MAX_SIZE_MB = 100; // 100 MB
const DEFAULT_MAX_ITEMS = 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function resolveCacheOptions(
  overrides: ResourceCacheOptions = {},
): ResolvedCacheOptions {
  const ttlSeconds = parseNumberEnv(
    process.env.MCP_RESOURCE_TTL,
    DEFAULT_TTL_MS / 1000,
  );
  const maxSizeMb = parseNumberEnv(
    process.env.MCP_RESOURCE_MAX_SIZE,
    DEFAULT_MAX_SIZE_MB,
  );
  const maxItems = Math.floor(
    parseNumberEnv(process.env.MCP_RESOURCE_MAX_ITEMS, DEFAULT_MAX_ITEMS),
  );
  const cleanupIntervalMs = parseNumberEnv(
    process.env.MCP_RESOURCE_CLEANUP_INTERVAL,
    DEFAULT_CLEANUP_INTERVAL_MS,
  );

  const defaults: ResolvedCacheOptions = {
    defaultTTL: ttlSeconds * 1000,
    maxItems,
    maxSizeBytes: maxSizeMb * 1024 * 1024,
    cleanupInterval: cleanupIntervalMs,
  };

  return {
    defaultTTL: overrides.defaultTTL ?? defaults.defaultTTL,
    maxItems: overrides.maxItems ?? defaults.maxItems,
    maxSizeBytes: overrides.maxSizeBytes ?? defaults.maxSizeBytes,
    cleanupInterval: overrides.cleanupInterval ?? defaults.cleanupInterval,
  };
}
