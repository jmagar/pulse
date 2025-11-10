/**
 * @fileoverview Metrics collection and aggregation
 *
 * Provides a singleton metrics collector that tracks cache operations,
 * scraping strategy performance, and request latencies. Supports
 * percentile calculations and detailed error tracking.
 *
 * @module shared/monitoring/metrics-collector
 */

import type {
  CacheMetrics,
  StrategyMetrics,
  StrategyMetric,
  RequestMetrics,
  AllMetrics,
  IMetricsCollector,
} from './types.js';

/**
 * Calculates percentile from a sorted array of numbers
 * @param sorted Sorted array of numbers
 * @param percentile Percentile to calculate (0-1)
 * @returns The value at the specified percentile
 */
function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * MetricsCollector implementation
 *
 * Collects and aggregates performance metrics for cache, strategies,
 * and requests. Thread-safe for concurrent operations.
 */
export class MetricsCollector implements IMetricsCollector {
  // Cache metrics
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheWrites = 0;
  private cacheEvictions = 0;
  private totalBytesWritten = 0;
  private currentSizeBytes = 0;
  private itemCount = 0;

  // Strategy metrics (keyed by strategy name)
  private strategyStats = new Map<
    string,
    {
      successCount: number;
      failureCount: number;
      totalDurationMs: number;
      fallbackCount: number;
      errors: Map<string, number>;
    }
  >();

  // Request metrics
  private totalRequests = 0;
  private totalErrors = 0;
  private totalResponseTimeMs = 0;
  private requestLatencies: number[] = [];

  /**
   * Record a cache hit
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Record a cache write operation
   * @param bytes Number of bytes written
   */
  recordCacheWrite(bytes: number): void {
    this.cacheWrites++;
    this.totalBytesWritten += bytes;
  }

  /**
   * Record a cache eviction
   */
  recordCacheEviction(): void {
    this.cacheEvictions++;
  }

  /**
   * Update current storage size
   * @param bytes Current size in bytes
   */
  updateStorageSize(bytes: number): void {
    this.currentSizeBytes = bytes;
  }

  /**
   * Update item count
   * @param count Number of items in cache
   */
  updateItemCount(count: number): void {
    this.itemCount = count;
  }

  /**
   * Get cache metrics
   * @returns Cache performance metrics
   */
  getCacheMetrics(): CacheMetrics {
    const totalAccesses = this.cacheHits + this.cacheMisses;
    const hitRate = totalAccesses > 0 ? this.cacheHits / totalAccesses : 0;
    const missRate = totalAccesses > 0 ? this.cacheMisses / totalAccesses : 0;

    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      writes: this.cacheWrites,
      evictions: this.cacheEvictions,
      hitRate,
      missRate,
      currentSizeBytes: this.currentSizeBytes,
      totalBytesWritten: this.totalBytesWritten,
      itemCount: this.itemCount,
    };
  }

  /**
   * Record a strategy execution
   * @param strategy Strategy name
   * @param success Whether the execution succeeded
   * @param durationMs Execution duration in milliseconds
   */
  recordStrategyExecution(strategy: string, success: boolean, durationMs: number): void {
    if (!this.strategyStats.has(strategy)) {
      this.strategyStats.set(strategy, {
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
        fallbackCount: 0,
        errors: new Map(),
      });
    }

    const stats = this.strategyStats.get(strategy)!;
    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }
    stats.totalDurationMs += durationMs;
  }

  /**
   * Record a fallback from one strategy to another
   * @param fromStrategy Strategy that failed
   * @param toStrategy Strategy that was used instead
   */
  recordFallback(fromStrategy: string, toStrategy: string): void {
    if (!this.strategyStats.has(fromStrategy)) {
      this.strategyStats.set(fromStrategy, {
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
        fallbackCount: 0,
        errors: new Map(),
      });
    }

    const stats = this.strategyStats.get(fromStrategy)!;
    stats.fallbackCount++;
  }

  /**
   * Record a strategy error
   * @param strategy Strategy name
   * @param error Error message
   */
  recordStrategyError(strategy: string, error: string): void {
    if (!this.strategyStats.has(strategy)) {
      this.strategyStats.set(strategy, {
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
        fallbackCount: 0,
        errors: new Map(),
      });
    }

    const stats = this.strategyStats.get(strategy)!;
    const currentCount = stats.errors.get(error) || 0;
    stats.errors.set(error, currentCount + 1);
  }

  /**
   * Get strategy metrics
   * @returns Strategy performance metrics
   */
  getStrategyMetrics(): StrategyMetrics {
    const metrics: StrategyMetrics = {};

    for (const [strategy, stats] of this.strategyStats) {
      const totalExecutions = stats.successCount + stats.failureCount;
      const successRate = totalExecutions > 0 ? stats.successCount / totalExecutions : 0;
      const avgDurationMs = totalExecutions > 0 ? stats.totalDurationMs / totalExecutions : 0;

      const metric: StrategyMetric = {
        successCount: stats.successCount,
        failureCount: stats.failureCount,
        totalExecutions,
        successRate,
        totalDurationMs: stats.totalDurationMs,
        avgDurationMs,
        fallbackCount: stats.fallbackCount,
      };

      // Add errors if any exist
      if (stats.errors.size > 0) {
        metric.errors = {};
        for (const [error, count] of stats.errors) {
          metric.errors[error] = count;
        }
      }

      metrics[strategy] = metric;
    }

    return metrics;
  }

  /**
   * Record a request
   * @param durationMs Request duration in milliseconds
   * @param isError Whether the request resulted in an error
   */
  recordRequest(durationMs: number, isError: boolean): void {
    this.totalRequests++;
    this.totalResponseTimeMs += durationMs;
    this.requestLatencies.push(durationMs);

    // Cap latency samples to prevent unbounded memory growth
    if (this.requestLatencies.length > 5000) {
      this.requestLatencies.shift();
    }

    if (isError) {
      this.totalErrors++;
    }
  }

  /**
   * Get request metrics
   * @returns Request performance metrics
   */
  getRequestMetrics(): RequestMetrics {
    const errorRate = this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0;
    const avgResponseTimeMs =
      this.totalRequests > 0 ? this.totalResponseTimeMs / this.totalRequests : 0;

    // Calculate percentiles
    const sortedLatencies = [...this.requestLatencies].sort((a, b) => a - b);
    const p50Ms = calculatePercentile(sortedLatencies, 0.5);
    const p95Ms = calculatePercentile(sortedLatencies, 0.95);
    const p99Ms = calculatePercentile(sortedLatencies, 0.99);

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      errorRate,
      avgResponseTimeMs,
      p50Ms,
      p95Ms,
      p99Ms,
    };
  }

  /**
   * Get all metrics
   * @returns Complete metrics snapshot
   */
  getAllMetrics(): AllMetrics {
    return {
      cache: this.getCacheMetrics(),
      strategies: this.getStrategyMetrics(),
      requests: this.getRequestMetrics(),
      timestamp: Date.now(),
    };
  }

  /**
   * Get a human-readable metrics summary
   * @returns Formatted metrics summary
   */
  getMetricsSummary(): string {
    const cache = this.getCacheMetrics();
    const requests = this.getRequestMetrics();
    const strategies = this.getStrategyMetrics();

    const lines: string[] = [
      '=== Performance Metrics ===',
      '',
      '--- Cache ---',
      `Cache Hit Rate: ${(cache.hitRate * 100).toFixed(2)}%`,
      `Cache Miss Rate: ${(cache.missRate * 100).toFixed(2)}%`,
      `Total Hits: ${cache.hits}`,
      `Total Misses: ${cache.misses}`,
      `Total Writes: ${cache.writes}`,
      `Evictions: ${cache.evictions}`,
      `Items in Cache: ${cache.itemCount}`,
      `Storage Size: ${(cache.currentSizeBytes / 1024 / 1024).toFixed(2)} MB`,
      '',
      '--- Requests ---',
      `Total Requests: ${requests.totalRequests}`,
      `Error Rate: ${(requests.errorRate * 100).toFixed(2)}%`,
      `Avg Response Time: ${requests.avgResponseTimeMs.toFixed(2)}ms`,
      `P50: ${requests.p50Ms.toFixed(2)}ms`,
      `P95: ${requests.p95Ms.toFixed(2)}ms`,
      `P99: ${requests.p99Ms.toFixed(2)}ms`,
    ];

    if (Object.keys(strategies).length > 0) {
      lines.push('', '--- Strategies ---');
      for (const [name, stats] of Object.entries(strategies)) {
        lines.push(
          `${name}: ${stats.totalExecutions} executions, ${(stats.successRate * 100).toFixed(2)}% success, ${stats.avgDurationMs.toFixed(2)}ms avg`
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheWrites = 0;
    this.cacheEvictions = 0;
    this.totalBytesWritten = 0;
    this.currentSizeBytes = 0;
    this.itemCount = 0;

    this.strategyStats.clear();

    this.totalRequests = 0;
    this.totalErrors = 0;
    this.totalResponseTimeMs = 0;
    this.requestLatencies = [];
  }
}

/**
 * Global metrics collector instance
 */
let globalCollector: MetricsCollector | null = null;

/**
 * Get or create the global metrics collector
 * @returns Global metrics collector instance
 */
export function getMetricsCollector(): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new MetricsCollector();
  }
  return globalCollector;
}

/**
 * Reset the global metrics collector
 */
export function resetMetricsCollector(): void {
  if (globalCollector) {
    globalCollector.reset();
  }
}
