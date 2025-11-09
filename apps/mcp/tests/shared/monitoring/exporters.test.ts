import { describe, it, expect } from 'vitest';
import { ConsoleExporter } from '../../../shared/monitoring/exporters/console-exporter.js';
import { JSONExporter } from '../../../shared/monitoring/exporters/json-exporter.js';
import type { AllMetrics } from '../../../shared/monitoring/types.js';

describe('Exporters', () => {
  const sampleMetrics: AllMetrics = {
    cache: {
      hits: 100,
      misses: 25,
      writes: 30,
      evictions: 5,
      hitRate: 0.8,
      missRate: 0.2,
      currentSizeBytes: 1024 * 1024 * 10, // 10 MB
      totalBytesWritten: 1024 * 1024 * 50, // 50 MB
      itemCount: 42,
    },
    strategies: {
      native: {
        successCount: 80,
        failureCount: 20,
        totalExecutions: 100,
        successRate: 0.8,
        totalDurationMs: 15000,
        avgDurationMs: 150,
        fallbackCount: 10,
        errors: {
          'Connection timeout': 5,
          'DNS error': 3,
        },
      },
      firecrawl: {
        successCount: 45,
        failureCount: 5,
        totalExecutions: 50,
        successRate: 0.9,
        totalDurationMs: 12500,
        avgDurationMs: 250,
        fallbackCount: 0,
      },
    },
    requests: {
      totalRequests: 150,
      totalErrors: 15,
      errorRate: 0.1,
      avgResponseTimeMs: 200,
      p50Ms: 180,
      p95Ms: 350,
      p99Ms: 500,
    },
    timestamp: 1699999999000,
  };

  describe('ConsoleExporter', () => {
    it('should export metrics in console format', () => {
      const exporter = new ConsoleExporter();
      const output = exporter.export(sampleMetrics);

      expect(output).toContain('=== Metrics Report');
      expect(output).toContain('--- Cache Performance ---');
      expect(output).toContain('--- Strategy Performance ---');
      expect(output).toContain('--- Request Performance ---');
    });

    it('should include timestamp when enabled', () => {
      const exporter = new ConsoleExporter({ includeTimestamp: true });
      const output = exporter.export(sampleMetrics);

      expect(output).toContain('2023-11-14T'); // ISO timestamp format (1699999999000 is Nov 14)
    });

    it('should exclude timestamp when disabled', () => {
      const exporter = new ConsoleExporter({ includeTimestamp: false });
      const output = exporter.export(sampleMetrics);

      expect(output).not.toContain('2023-11-15T');
      expect(output).toContain('=== Metrics Report ===');
    });

    it('should format percentages correctly', () => {
      const exporter = new ConsoleExporter();
      const output = exporter.export(sampleMetrics);

      expect(output).toContain('Hit Rate:        80.00%');
      expect(output).toContain('Miss Rate:       20.00%');
      expect(output).toContain('Success Rate:  80.00%');
    });

    it('should format bytes in human-readable format', () => {
      const exporter = new ConsoleExporter();
      const output = exporter.export(sampleMetrics);

      expect(output).toContain('Storage Size:    10.00 MB');
      expect(output).toContain('Total Written:   50.00 MB');
    });

    it('should include strategy errors when present', () => {
      const exporter = new ConsoleExporter();
      const output = exporter.export(sampleMetrics);

      expect(output).toContain('Errors:');
      expect(output).toContain('Connection timeout: 5');
      expect(output).toContain('DNS error: 3');
    });

    it('should not show errors section when no errors exist', () => {
      const metricsWithoutErrors: AllMetrics = {
        ...sampleMetrics,
        strategies: {
          native: {
            successCount: 80,
            failureCount: 20,
            totalExecutions: 100,
            successRate: 0.8,
            totalDurationMs: 15000,
            avgDurationMs: 150,
            fallbackCount: 10,
            // No errors property at all
          },
        },
      };

      const exporter = new ConsoleExporter();
      const output = exporter.export(metricsWithoutErrors);

      // The native strategy section should not have an Errors subsection
      expect(output).toContain('native:');
      // Check that there's no "    Errors:" (the indented strategy error section)
      expect(output).not.toContain('    Errors:');
    });

    it('should format latency percentiles', () => {
      const exporter = new ConsoleExporter();
      const output = exporter.export(sampleMetrics);

      expect(output).toContain('P50 (median):  180.00ms');
      expect(output).toContain('P95:           350.00ms');
      expect(output).toContain('P99:           500.00ms');
    });

    it('should handle empty strategies', () => {
      const metricsWithoutStrategies: AllMetrics = {
        ...sampleMetrics,
        strategies: {},
      };

      const exporter = new ConsoleExporter();
      const output = exporter.export(metricsWithoutStrategies);

      // Should still have cache and request sections
      expect(output).toContain('--- Cache Performance ---');
      expect(output).toContain('--- Request Performance ---');
      // But not strategy section
      expect(output).not.toContain('--- Strategy Performance ---');
    });
  });

  describe('JSONExporter', () => {
    it('should export metrics as compact JSON by default', () => {
      const exporter = new JSONExporter();
      const output = exporter.export(sampleMetrics);

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toEqual(sampleMetrics);

      // Should not have newlines (compact)
      expect(output).not.toContain('\n');
    });

    it('should export metrics as pretty JSON when enabled', () => {
      const exporter = new JSONExporter({ pretty: true });
      const output = exporter.export(sampleMetrics);

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toEqual(sampleMetrics);

      // Should have newlines and indentation (pretty)
      expect(output).toContain('\n');
      expect(output).toContain('  '); // Indentation
    });

    it('should preserve all metric data', () => {
      const exporter = new JSONExporter();
      const output = exporter.export(sampleMetrics);
      const parsed = JSON.parse(output);

      // Check all top-level sections
      expect(parsed.cache).toBeDefined();
      expect(parsed.strategies).toBeDefined();
      expect(parsed.requests).toBeDefined();
      expect(parsed.timestamp).toBeDefined();

      // Check nested data
      expect(parsed.cache.hits).toBe(100);
      expect(parsed.strategies.native.successRate).toBe(0.8);
      expect(parsed.requests.p99Ms).toBe(500);
    });

    it('should handle empty strategies in JSON', () => {
      const metricsWithoutStrategies: AllMetrics = {
        ...sampleMetrics,
        strategies: {},
      };

      const exporter = new JSONExporter();
      const output = exporter.export(metricsWithoutStrategies);
      const parsed = JSON.parse(output);

      expect(parsed.strategies).toEqual({});
    });

    it('should handle metrics with no errors', () => {
      const metricsWithoutErrors: AllMetrics = {
        ...sampleMetrics,
        strategies: {
          native: {
            ...sampleMetrics.strategies.native,
            errors: undefined,
          },
        },
      };

      const exporter = new JSONExporter();
      const output = exporter.export(metricsWithoutErrors);
      const parsed = JSON.parse(output);

      expect(parsed.strategies.native.errors).toBeUndefined();
    });
  });
});
