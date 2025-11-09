# Monitoring Module

Performance monitoring infrastructure for the pulse-crawl MCP server.

## Overview

Provides comprehensive metrics collection for:
- **Cache operations**: Hit/miss rates, storage size, evictions
- **Scraping strategies**: Success rates, execution times, fallbacks, errors
- **Request performance**: Latency percentiles (P50/P95/P99), error rates

## Architecture

```
shared/monitoring/
├── types.ts                  # Metric type definitions
├── metrics-collector.ts      # Core metrics collection
├── exporters/
│   ├── console-exporter.ts  # Human-readable format
│   └── json-exporter.ts     # Structured JSON format
└── index.ts                  # Main exports
```

## Usage

### Basic Usage

```typescript
import { getMetricsCollector } from './monitoring/index.js';

const metrics = getMetricsCollector();

// Record cache operations
metrics.recordCacheHit();
metrics.recordCacheMiss();
metrics.recordCacheWrite(1024);
metrics.updateStorageSize(totalBytes);

// Record strategy execution
metrics.recordStrategyExecution('native', true, durationMs);
metrics.recordFallback('native', 'firecrawl');
metrics.recordStrategyError('native', errorMessage);

// Record requests
metrics.recordRequest(durationMs, isError);

// Get current metrics
const allMetrics = metrics.getAllMetrics();
```

### Exporting Metrics

```typescript
import { ConsoleExporter, JSONExporter } from './monitoring/index.js';

// Console format (human-readable)
const consoleExporter = new ConsoleExporter({ includeTimestamp: true });
const consoleOutput = consoleExporter.export(allMetrics);
console.log(consoleOutput);

// JSON format (structured)
const jsonExporter = new JSONExporter({ pretty: true });
const jsonOutput = jsonExporter.export(allMetrics);
```

## HTTP Endpoints (Remote Server)

The remote server exposes metrics via HTTP:

```bash
# Console format
curl http://localhost:3060/metrics

# JSON format
curl http://localhost:3060/metrics/json

# Reset metrics (testing only)
curl -X POST http://localhost:3060/metrics/reset
```

## Metrics Reference

### Cache Metrics

```typescript
interface CacheMetrics {
  hits: number;              // Total cache hits
  misses: number;            // Total cache misses
  writes: number;            // Total cache writes
  evictions: number;         // Total evictions
  hitRate: number;           // Hit rate (0-1)
  missRate: number;          // Miss rate (0-1)
  currentSizeBytes: number;  // Current storage size
  totalBytesWritten: number; // Total bytes written
  itemCount: number;         // Number of cached items
}
```

### Strategy Metrics

```typescript
interface StrategyMetric {
  successCount: number;      // Successful executions
  failureCount: number;      // Failed executions
  totalExecutions: number;   // Total attempts
  successRate: number;       // Success rate (0-1)
  totalDurationMs: number;   // Total execution time
  avgDurationMs: number;     // Average execution time
  fallbackCount: number;     // Times this strategy triggered fallback
  errors?: Record<string, number>; // Error counts by message
}

interface StrategyMetrics {
  [strategyName: string]: StrategyMetric;
}
```

### Request Metrics

```typescript
interface RequestMetrics {
  totalRequests: number;     // Total number of requests
  totalErrors: number;       // Total errors
  errorRate: number;         // Error rate (0-1)
  avgResponseTimeMs: number; // Average response time
  p50Ms: number;             // Median latency
  p95Ms: number;             // 95th percentile
  p99Ms: number;             // 99th percentile
}
```

## Integration Points

### Strategy Selector

Monitoring is integrated in `/shared/scraping/strategies/selector.ts`:

```typescript
import { getMetricsCollector } from '../../monitoring/index.js';

const metrics = getMetricsCollector();

// In tryNative() and tryFirecrawl()
const duration = Date.now() - startTime;
metrics.recordStrategyExecution(strategyName, success, duration);

if (error) {
  metrics.recordStrategyError(strategyName, errorMessage);
}

// When falling back
metrics.recordFallback('native', 'firecrawl');
```

### Tool Handler

Request tracking is integrated in `/shared/mcp/registration.ts`:

```typescript
import { getMetricsCollector } from '../monitoring/index.js';

const metrics = getMetricsCollector();
const startTime = Date.now();

try {
  const result = await tool.handler(args);
  const duration = Date.now() - startTime;
  metrics.recordRequest(duration, false);
  return result;
} catch (error) {
  const duration = Date.now() - startTime;
  metrics.recordRequest(duration, true);
  throw error;
}
```

### Storage Layer (Not Yet Implemented)

To integrate with storage (when available):

```typescript
import { getMetricsCollector } from '../monitoring/index.js';

class MemoryResourceStorage {
  async read(uri: string) {
    const metrics = getMetricsCollector();

    if (this.cache.has(uri)) {
      metrics.recordCacheHit();
      return this.cache.get(uri);
    }

    metrics.recordCacheMiss();
    // ... fetch and cache
  }

  async write(url: string, content: string) {
    const metrics = getMetricsCollector();
    const bytes = Buffer.byteLength(content);

    // ... write to cache

    metrics.recordCacheWrite(bytes);
    metrics.updateItemCount(this.cache.size);
    metrics.updateStorageSize(this.getTotalSize());
  }
}
```

## Testing

```bash
# Run all monitoring tests
npm test -- tests/shared/monitoring/

# Unit tests
npm test -- tests/shared/monitoring/metrics.test.ts

# Exporter tests
npm test -- tests/shared/monitoring/exporters.test.ts

# Integration tests
npm test -- tests/shared/monitoring/integration.test.ts
```

## Best Practices

1. **Singleton Pattern**: Always use `getMetricsCollector()` to get the global instance
2. **Non-Blocking**: Metric recording is synchronous and fast - no async overhead
3. **Memory Efficient**: Request latencies are stored for percentile calculation, but consider limits for long-running servers
4. **Reset Carefully**: Only reset metrics in testing/debugging, not in production
5. **Export Regularly**: In production, export metrics to monitoring systems periodically

## Future Enhancements

- [ ] Integrate with storage layer when available
- [ ] Add metric history/windowing for time-series data
- [ ] Add Prometheus exporter for production monitoring
- [ ] Add metric aggregation across multiple server instances
- [ ] Add configurable metric retention periods
- [ ] Add automatic metric export on intervals

## Related Files

- `/shared/monitoring/types.ts` - Type definitions
- `/shared/monitoring/metrics-collector.ts` - Core implementation
- `/shared/monitoring/exporters/` - Export formats
- `/remote/middleware/metrics.ts` - HTTP endpoints
- `/tests/shared/monitoring/` - Test suite

## Performance Impact

- **Negligible overhead**: Simple counters and in-memory aggregation
- **No external dependencies**: No network calls or I/O
- **Fast percentile calculation**: Efficient sorting algorithm
- **Small memory footprint**: ~100 bytes per recorded request latency
