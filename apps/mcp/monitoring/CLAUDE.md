# Monitoring Module

Performance metrics collection and export for the MCP server.

## Architecture

Three-tier design with singleton pattern:

1. **Types** (`types.ts`) - Interface definitions for metrics structure
2. **Collector** (`metrics-collector.ts`) - Core metrics recording with percentile calculation
3. **Exporters** (`exporters/`) - Format-specific output (console, JSON)

## Metrics

Tracks three metric categories:

### Cache Metrics

- Hit/miss counts and rates
- Storage size and write volume
- Eviction count
- Item count

### Strategy Metrics

- Per-strategy: success count, failure count, total duration
- Aggregated: success rate, average duration, fallback count
- Error tracking by message

### Request Metrics

- Total requests and error count
- Error rate, average response time
- Latency percentiles (P50, P95, P99)
- Efficient percentile calculation with sorted array interpolation

## Integration Points

### Tool Registration (`../tools/registration.ts`)

```typescript
const metrics = getMetricsCollector();
const startTime = Date.now();
try {
  const result = await handler(args);
  const duration = Date.now() - startTime;
  metrics.recordRequest(duration, false);
} catch (error) {
  const duration = Date.now() - startTime;
  metrics.recordRequest(duration, true);
  throw error;
}
```

### Strategy Selector (`../scraping/strategies/selector.ts`)

Records per-strategy execution metrics:

```typescript
const metrics = getMetricsCollector();
const duration = Date.now() - startTime;
metrics.recordStrategyExecution(strategyName, success, duration);
if (error) metrics.recordStrategyError(strategyName, errorMessage);
if (fallback) metrics.recordFallback(fromStrategy, toStrategy);
```

## HTTP Endpoints

Exposed via metrics middleware (`../server/middleware/metrics.ts`):

- `GET /metrics` - Console-formatted metrics with timestamp
- `GET /metrics/json` - Structured JSON output
- `POST /metrics/reset` - Clear all metrics (testing only)

## Usage

```typescript
import {
  getMetricsCollector,
  ConsoleExporter,
  JSONExporter,
} from "../monitoring";

const metrics = getMetricsCollector();

// Record metrics
metrics.recordRequest(durationMs, isError);
metrics.recordStrategyExecution(name, success, durationMs);
metrics.recordCacheHit();
metrics.recordCacheWrite(bytes);

// Get metrics
const all = metrics.getAllMetrics();
const cache = metrics.getCacheMetrics();
const strategies = metrics.getStrategyMetrics();
const requests = metrics.getRequestMetrics();

// Export
const consoleExporter = new ConsoleExporter({ includeTimestamp: true });
console.log(consoleExporter.export(all));

const jsonExporter = new JSONExporter({ pretty: true });
const json = jsonExporter.export(all);
```

## Key Design Decisions

1. **Singleton Pattern**: `getMetricsCollector()` ensures single global instance
2. **Synchronous Recording**: No async overhead - metrics are in-memory counters
3. **Percentile Calculation**: On-demand (not pre-calculated) to avoid continuous sorting
4. **Bounded Latencies**: Max 5000 stored latencies to prevent unbounded memory growth
5. **Non-Blocking**: Fast counters and maps suitable for high-frequency calls

## Related Files

- Core: `types.ts`, `metrics-collector.ts`
- Exporters: `exporters/console-exporter.ts`, `exporters/json-exporter.ts`
- Main export: `index.ts`
- HTTP handlers: `../server/middleware/metrics.ts`
- Consumers: `../tools/registration.ts`, `../scraping/strategies/selector.ts`
