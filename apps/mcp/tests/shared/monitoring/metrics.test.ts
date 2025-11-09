import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../../../shared/monitoring/metrics-collector.js';
import type {
  CacheMetrics,
  StrategyMetrics,
  RequestMetrics,
  AllMetrics,
} from '../../../shared/monitoring/types.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('Cache Metrics', () => {
    it('should initialize with zero cache metrics', () => {
      const metrics = collector.getCacheMetrics();

      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.writes).toBe(0);
      expect(metrics.evictions).toBe(0);
      expect(metrics.hitRate).toBe(0);
      expect(metrics.missRate).toBe(0);
    });

    it('should record cache hits', () => {
      collector.recordCacheHit();
      collector.recordCacheHit();

      const metrics = collector.getCacheMetrics();
      expect(metrics.hits).toBe(2);
    });

    it('should record cache misses', () => {
      collector.recordCacheMiss();
      collector.recordCacheMiss();
      collector.recordCacheMiss();

      const metrics = collector.getCacheMetrics();
      expect(metrics.misses).toBe(3);
    });

    it('should record cache writes', () => {
      collector.recordCacheWrite(1024);
      collector.recordCacheWrite(2048);

      const metrics = collector.getCacheMetrics();
      expect(metrics.writes).toBe(2);
      expect(metrics.totalBytesWritten).toBe(3072);
    });

    it('should record cache evictions', () => {
      collector.recordCacheEviction();

      const metrics = collector.getCacheMetrics();
      expect(metrics.evictions).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      collector.recordCacheHit();
      collector.recordCacheHit();
      collector.recordCacheHit();
      collector.recordCacheMiss();

      const metrics = collector.getCacheMetrics();
      expect(metrics.hitRate).toBe(0.75); // 3 hits / 4 total
    });

    it('should calculate miss rate correctly', () => {
      collector.recordCacheHit();
      collector.recordCacheMiss();
      collector.recordCacheMiss();
      collector.recordCacheMiss();

      const metrics = collector.getCacheMetrics();
      expect(metrics.missRate).toBe(0.75); // 3 misses / 4 total
    });

    it('should handle zero total accesses for rates', () => {
      const metrics = collector.getCacheMetrics();
      expect(metrics.hitRate).toBe(0);
      expect(metrics.missRate).toBe(0);
    });

    it('should track current storage size', () => {
      collector.updateStorageSize(1024 * 1024); // 1 MB

      const metrics = collector.getCacheMetrics();
      expect(metrics.currentSizeBytes).toBe(1024 * 1024);
    });

    it('should track item count', () => {
      collector.updateItemCount(42);

      const metrics = collector.getCacheMetrics();
      expect(metrics.itemCount).toBe(42);
    });
  });

  describe('Strategy Metrics', () => {
    it('should initialize with empty strategy metrics', () => {
      const metrics = collector.getStrategyMetrics();

      expect(metrics.native).toBeUndefined();
      expect(metrics.firecrawl).toBeUndefined();
    });

    it('should record successful strategy execution', () => {
      collector.recordStrategyExecution('native', true, 150);

      const metrics = collector.getStrategyMetrics();
      expect(metrics.native).toBeDefined();
      expect(metrics.native!.successCount).toBe(1);
      expect(metrics.native!.failureCount).toBe(0);
      expect(metrics.native!.totalExecutions).toBe(1);
      expect(metrics.native!.totalDurationMs).toBe(150);
    });

    it('should record failed strategy execution', () => {
      collector.recordStrategyExecution('firecrawl', false, 200);

      const metrics = collector.getStrategyMetrics();
      expect(metrics.firecrawl).toBeDefined();
      expect(metrics.firecrawl!.successCount).toBe(0);
      expect(metrics.firecrawl!.failureCount).toBe(1);
      expect(metrics.firecrawl!.totalExecutions).toBe(1);
    });

    it('should calculate success rate correctly', () => {
      collector.recordStrategyExecution('native', true, 100);
      collector.recordStrategyExecution('native', true, 110);
      collector.recordStrategyExecution('native', true, 120);
      collector.recordStrategyExecution('native', false, 130);

      const metrics = collector.getStrategyMetrics();
      expect(metrics.native!.successRate).toBe(0.75); // 3 success / 4 total
    });

    it('should calculate average execution time', () => {
      collector.recordStrategyExecution('native', true, 100);
      collector.recordStrategyExecution('native', true, 200);
      collector.recordStrategyExecution('native', false, 300);

      const metrics = collector.getStrategyMetrics();
      expect(metrics.native!.avgDurationMs).toBe(200); // (100 + 200 + 300) / 3
    });

    it('should record fallback occurrences', () => {
      collector.recordFallback('native', 'firecrawl');
      collector.recordFallback('native', 'firecrawl');

      const metrics = collector.getStrategyMetrics();
      expect(metrics.native!.fallbackCount).toBe(2);
    });

    it('should track multiple strategies independently', () => {
      collector.recordStrategyExecution('native', true, 100);
      collector.recordStrategyExecution('native', false, 150);
      collector.recordStrategyExecution('firecrawl', true, 200);
      collector.recordStrategyExecution('firecrawl', true, 250);

      const metrics = collector.getStrategyMetrics();

      expect(metrics.native!.totalExecutions).toBe(2);
      expect(metrics.native!.successRate).toBe(0.5);

      expect(metrics.firecrawl!.totalExecutions).toBe(2);
      expect(metrics.firecrawl!.successRate).toBe(1.0);
    });

    it('should record strategy errors', () => {
      collector.recordStrategyError('native', 'Connection timeout');
      collector.recordStrategyError('native', 'Connection timeout');
      collector.recordStrategyError('native', 'DNS error');

      const metrics = collector.getStrategyMetrics();
      expect(metrics.native!.errors).toBeDefined();
      expect(metrics.native!.errors!['Connection timeout']).toBe(2);
      expect(metrics.native!.errors!['DNS error']).toBe(1);
    });
  });

  describe('Request Metrics', () => {
    it('should initialize with zero request metrics', () => {
      const metrics = collector.getRequestMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.avgResponseTimeMs).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it('should record successful requests', () => {
      collector.recordRequest(100, false);
      collector.recordRequest(150, false);

      const metrics = collector.getRequestMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.totalErrors).toBe(0);
    });

    it('should record failed requests', () => {
      collector.recordRequest(100, true);
      collector.recordRequest(150, false);

      const metrics = collector.getRequestMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorRate).toBe(0.5);
    });

    it('should calculate average response time', () => {
      collector.recordRequest(100, false);
      collector.recordRequest(200, false);
      collector.recordRequest(300, false);

      const metrics = collector.getRequestMetrics();
      expect(metrics.avgResponseTimeMs).toBe(200);
    });

    it('should calculate P50 latency', () => {
      // Record 100 requests with varying latencies
      for (let i = 1; i <= 100; i++) {
        collector.recordRequest(i, false);
      }

      const metrics = collector.getRequestMetrics();
      // P50 should be around 50-51
      expect(metrics.p50Ms).toBeGreaterThanOrEqual(50);
      expect(metrics.p50Ms).toBeLessThanOrEqual(51);
    });

    it('should calculate P95 latency', () => {
      // Record 100 requests with varying latencies
      for (let i = 1; i <= 100; i++) {
        collector.recordRequest(i, false);
      }

      const metrics = collector.getRequestMetrics();
      // P95 should be around 95
      expect(metrics.p95Ms).toBeGreaterThanOrEqual(95);
      expect(metrics.p95Ms).toBeLessThanOrEqual(96);
    });

    it('should calculate P99 latency', () => {
      // Record 100 requests with varying latencies
      for (let i = 1; i <= 100; i++) {
        collector.recordRequest(i, false);
      }

      const metrics = collector.getRequestMetrics();
      // P99 should be around 99
      expect(metrics.p99Ms).toBeGreaterThanOrEqual(99);
      expect(metrics.p99Ms).toBeLessThanOrEqual(100);
    });

    it('should handle single request for percentiles', () => {
      collector.recordRequest(100, false);

      const metrics = collector.getRequestMetrics();
      expect(metrics.p50Ms).toBe(100);
      expect(metrics.p95Ms).toBe(100);
      expect(metrics.p99Ms).toBe(100);
    });

    it('should maintain request history for accurate percentiles', () => {
      // Record in non-sequential order
      collector.recordRequest(50, false);
      collector.recordRequest(10, false);
      collector.recordRequest(90, false);
      collector.recordRequest(30, false);
      collector.recordRequest(70, false);

      const metrics = collector.getRequestMetrics();
      expect(metrics.p50Ms).toBe(50); // median of [10, 30, 50, 70, 90]
    });
  });

  describe('getAllMetrics', () => {
    it('should return all metrics in one object', () => {
      collector.recordCacheHit();
      collector.recordCacheMiss();
      collector.recordStrategyExecution('native', true, 100);
      collector.recordRequest(150, false);

      const allMetrics = collector.getAllMetrics();

      expect(allMetrics.cache).toBeDefined();
      expect(allMetrics.strategies).toBeDefined();
      expect(allMetrics.requests).toBeDefined();
      expect(allMetrics.timestamp).toBeDefined();
    });

    it('should include timestamp in metrics', () => {
      const before = Date.now();
      const allMetrics = collector.getAllMetrics();
      const after = Date.now();

      expect(allMetrics.timestamp).toBeGreaterThanOrEqual(before);
      expect(allMetrics.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('reset', () => {
    it('should reset all metrics to initial state', () => {
      // Record various metrics
      collector.recordCacheHit();
      collector.recordCacheMiss();
      collector.recordCacheWrite(1024);
      collector.recordStrategyExecution('native', true, 100);
      collector.recordRequest(150, false);

      // Reset
      collector.reset();

      // Verify all metrics are reset
      const cache = collector.getCacheMetrics();
      expect(cache.hits).toBe(0);
      expect(cache.misses).toBe(0);
      expect(cache.writes).toBe(0);

      const strategies = collector.getStrategyMetrics();
      expect(strategies.native).toBeUndefined();

      const requests = collector.getRequestMetrics();
      expect(requests.totalRequests).toBe(0);
    });
  });

  describe('getMetricsSummary', () => {
    it('should return a human-readable summary', () => {
      collector.recordCacheHit();
      collector.recordCacheHit();
      collector.recordCacheMiss();
      collector.recordStrategyExecution('native', true, 100);
      collector.recordRequest(150, false);

      const summary = collector.getMetricsSummary();

      expect(summary).toContain('Cache Hit Rate: 66.67%');
      expect(summary).toContain('Total Requests: 1');
    });
  });
});
