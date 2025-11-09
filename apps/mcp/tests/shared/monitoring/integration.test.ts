import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, ConsoleExporter, JSONExporter } from '../../../shared/monitoring/index.js';

describe('Monitoring Integration', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('should track complete scraping workflow metrics', () => {
    // Simulate a scraping workflow with strategy fallback

    // 1. Request starts
    const requestStart = Date.now();

    // 2. Try native strategy (fails)
    collector.recordStrategyExecution('native', false, 150);
    collector.recordStrategyError('native', 'Connection timeout');

    // 3. Fallback to firecrawl
    collector.recordFallback('native', 'firecrawl');

    // 4. Firecrawl succeeds
    collector.recordStrategyExecution('firecrawl', true, 250);

    // 5. Cache the result
    collector.recordCacheWrite(5120); // 5KB
    collector.updateItemCount(1);
    collector.updateStorageSize(5120);

    // 6. Request completes
    const requestDuration = Date.now() - requestStart;
    collector.recordRequest(requestDuration, false);

    // Verify all metrics were collected
    const cache = collector.getCacheMetrics();
    expect(cache.writes).toBe(1);
    expect(cache.itemCount).toBe(1);
    expect(cache.currentSizeBytes).toBe(5120);

    const strategies = collector.getStrategyMetrics();
    expect(strategies.native.totalExecutions).toBe(1);
    expect(strategies.native.successRate).toBe(0);
    expect(strategies.native.fallbackCount).toBe(1);
    expect(strategies.firecrawl.totalExecutions).toBe(1);
    expect(strategies.firecrawl.successRate).toBe(1);

    const requests = collector.getRequestMetrics();
    expect(requests.totalRequests).toBe(1);
    expect(requests.totalErrors).toBe(0);
  });

  it('should handle cache hit workflow', () => {
    // Simulate cache hit workflow

    // 1. Request starts
    const requestStart = Date.now();

    // 2. Check cache (hit)
    collector.recordCacheHit();

    // 3. Request completes quickly
    const requestDuration = Date.now() - requestStart;
    collector.recordRequest(requestDuration, false);

    // Verify metrics
    const cache = collector.getCacheMetrics();
    expect(cache.hits).toBe(1);
    expect(cache.hitRate).toBe(1);

    const requests = collector.getRequestMetrics();
    expect(requests.totalRequests).toBe(1);
  });

  it('should export metrics in console format', () => {
    // Add some metrics
    collector.recordCacheHit();
    collector.recordCacheMiss();
    collector.recordStrategyExecution('native', true, 100);
    collector.recordRequest(150, false);

    const exporter = new ConsoleExporter();
    const output = exporter.export(collector.getAllMetrics());

    expect(output).toContain('Cache Performance');
    expect(output).toContain('Strategy Performance');
    expect(output).toContain('Request Performance');
  });

  it('should export metrics in JSON format', () => {
    // Add some metrics
    collector.recordCacheHit();
    collector.recordStrategyExecution('native', true, 100);
    collector.recordRequest(150, false);

    const exporter = new JSONExporter({ pretty: false });
    const output = exporter.export(collector.getAllMetrics());

    // Should be valid JSON
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('cache');
    expect(parsed).toHaveProperty('strategies');
    expect(parsed).toHaveProperty('requests');
    expect(parsed).toHaveProperty('timestamp');
  });

  it('should track multiple concurrent operations', () => {
    // Simulate multiple operations
    for (let i = 0; i < 10; i++) {
      if (i % 3 === 0) {
        // Cache hit every 3rd request
        collector.recordCacheHit();
      } else {
        // Cache miss, fetch content
        collector.recordCacheMiss();
        collector.recordStrategyExecution('native', i % 2 === 0, 100 + i * 10);
        collector.recordCacheWrite(1024 * (i + 1));
      }
      collector.recordRequest(100 + i * 20, false);
    }

    collector.updateItemCount(7); // 7 items cached
    collector.updateStorageSize(1024 * 28); // Total size

    const cache = collector.getCacheMetrics();
    expect(cache.hits).toBe(4); // 0, 3, 6, 9
    expect(cache.misses).toBe(6); // 1, 2, 4, 5, 7, 8
    expect(cache.writes).toBe(6);
    expect(cache.hitRate).toBeCloseTo(0.4, 1);

    const requests = collector.getRequestMetrics();
    expect(requests.totalRequests).toBe(10);
    expect(requests.errorRate).toBe(0);
  });

  it('should calculate percentiles correctly with real data', () => {
    // Simulate realistic latency distribution
    const latencies = [
      50, 55, 60, 65, 70, // Fast requests
      100, 105, 110, 115, 120, // Normal requests
      150, 155, 160, 165, 170, // Slower requests
      200, 210, 220, 230, 240, // Slow requests
      500, 600, 700, 800, 900, // Very slow requests
    ];

    for (const latency of latencies) {
      collector.recordRequest(latency, false);
    }

    const metrics = collector.getRequestMetrics();

    // P50 should be around median (160)
    expect(metrics.p50Ms).toBeGreaterThan(150);
    expect(metrics.p50Ms).toBeLessThan(200);

    // P95 should be high (around 800-900)
    expect(metrics.p95Ms).toBeGreaterThan(700);

    // P99 should be very high (around 900)
    expect(metrics.p99Ms).toBeGreaterThan(850);
  });

  it('should handle reset correctly', () => {
    // Add metrics
    collector.recordCacheHit();
    collector.recordCacheMiss();
    collector.recordStrategyExecution('native', true, 100);
    collector.recordRequest(150, false);

    // Verify metrics exist
    expect(collector.getCacheMetrics().hits).toBe(1);
    expect(collector.getRequestMetrics().totalRequests).toBe(1);

    // Reset
    collector.reset();

    // Verify everything is reset
    const cache = collector.getCacheMetrics();
    expect(cache.hits).toBe(0);
    expect(cache.misses).toBe(0);
    expect(cache.writes).toBe(0);

    const strategies = collector.getStrategyMetrics();
    expect(Object.keys(strategies)).toHaveLength(0);

    const requests = collector.getRequestMetrics();
    expect(requests.totalRequests).toBe(0);
  });

  it('should generate meaningful summary', () => {
    // Add realistic metrics
    for (let i = 0; i < 100; i++) {
      if (i < 80) {
        collector.recordCacheHit();
      } else {
        collector.recordCacheMiss();
        collector.recordStrategyExecution('native', i < 90, 100 + i);
        collector.recordCacheWrite(2048);
      }
      collector.recordRequest(50 + i, i >= 95); // 5% error rate
    }

    collector.updateItemCount(20);
    collector.updateStorageSize(40960); // ~40KB

    const summary = collector.getMetricsSummary();

    expect(summary).toContain('Cache Hit Rate: 80.00%');
    expect(summary).toContain('Total Requests: 100');
    expect(summary).toContain('Error Rate: 5.00%');
    expect(summary).toContain('Items in Cache: 20');
  });
});
