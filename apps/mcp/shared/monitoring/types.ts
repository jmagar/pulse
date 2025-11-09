/**
 * @fileoverview Types and interfaces for performance monitoring
 *
 * Defines metrics structures for cache operations, scraping strategies,
 * and request performance tracking.
 *
 * @module shared/monitoring/types
 */

/**
 * Cache performance metrics
 *
 * Tracks cache hit/miss rates, storage utilization, and eviction statistics.
 */
export interface CacheMetrics {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of writes to cache */
  writes: number;
  /** Number of evicted items */
  evictions: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Cache miss rate (0-1) */
  missRate: number;
  /** Current storage size in bytes */
  currentSizeBytes: number;
  /** Total bytes written to cache */
  totalBytesWritten: number;
  /** Number of items currently in cache */
  itemCount: number;
}

/**
 * Per-strategy performance metrics
 *
 * Tracks success rate, execution time, and error statistics for a single strategy.
 */
export interface StrategyMetric {
  /** Number of successful executions */
  successCount: number;
  /** Number of failed executions */
  failureCount: number;
  /** Total number of executions */
  totalExecutions: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Total execution time in milliseconds */
  totalDurationMs: number;
  /** Average execution time in milliseconds */
  avgDurationMs: number;
  /** Number of times this strategy triggered a fallback */
  fallbackCount: number;
  /** Error counts by error message */
  errors?: Record<string, number>;
}

/**
 * All strategy metrics
 *
 * Maps strategy names to their performance metrics.
 */
export interface StrategyMetrics {
  [strategyName: string]: StrategyMetric;
}

/**
 * Request performance metrics
 *
 * Tracks overall request statistics including latency percentiles.
 */
export interface RequestMetrics {
  /** Total number of requests */
  totalRequests: number;
  /** Total number of errors */
  totalErrors: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Average response time in milliseconds */
  avgResponseTimeMs: number;
  /** 50th percentile latency (median) */
  p50Ms: number;
  /** 95th percentile latency */
  p95Ms: number;
  /** 99th percentile latency */
  p99Ms: number;
}

/**
 * Complete metrics snapshot
 *
 * Contains all metrics with a timestamp.
 */
export interface AllMetrics {
  /** Cache metrics */
  cache: CacheMetrics;
  /** Strategy metrics */
  strategies: StrategyMetrics;
  /** Request metrics */
  requests: RequestMetrics;
  /** Timestamp when metrics were captured */
  timestamp: number;
}

/**
 * Metrics exporter interface
 *
 * Defines how metrics can be exported to different formats.
 */
export interface MetricsExporter {
  /**
   * Export metrics in the exporter's format
   * @param metrics The metrics to export
   * @returns Formatted metrics output
   */
  export(metrics: AllMetrics): string;
}

/**
 * Metrics collector interface
 *
 * Defines the interface for collecting and retrieving metrics.
 */
export interface IMetricsCollector {
  // Cache metrics
  recordCacheHit(): void;
  recordCacheMiss(): void;
  recordCacheWrite(bytes: number): void;
  recordCacheEviction(): void;
  updateStorageSize(bytes: number): void;
  updateItemCount(count: number): void;
  getCacheMetrics(): CacheMetrics;

  // Strategy metrics
  recordStrategyExecution(strategy: string, success: boolean, durationMs: number): void;
  recordFallback(fromStrategy: string, toStrategy: string): void;
  recordStrategyError(strategy: string, error: string): void;
  getStrategyMetrics(): StrategyMetrics;

  // Request metrics
  recordRequest(durationMs: number, isError: boolean): void;
  getRequestMetrics(): RequestMetrics;

  // Combined
  getAllMetrics(): AllMetrics;
  getMetricsSummary(): string;
  reset(): void;
}
