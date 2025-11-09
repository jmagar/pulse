/**
 * @fileoverview Console metrics exporter
 *
 * Exports metrics in a human-readable console format with color coding
 * and structured sections.
 *
 * @module shared/monitoring/exporters/console-exporter
 */

import type { AllMetrics, MetricsExporter } from '../types.js';

/**
 * ConsoleExporter - Formats metrics for console output
 *
 * Provides a clean, readable format suitable for logging and debugging.
 * Uses sections and formatting to organize different metric types.
 */
export class ConsoleExporter implements MetricsExporter {
  private readonly includeTimestamp: boolean;

  constructor(options: { includeTimestamp?: boolean } = {}) {
    this.includeTimestamp = options.includeTimestamp ?? true;
  }

  /**
   * Export metrics in console-friendly format
   * @param metrics The metrics to export
   * @returns Formatted string for console output
   */
  export(metrics: AllMetrics): string {
    const lines: string[] = [];

    if (this.includeTimestamp) {
      lines.push(`=== Metrics Report (${new Date(metrics.timestamp).toISOString()}) ===`);
    } else {
      lines.push('=== Metrics Report ===');
    }
    lines.push('');

    // Cache metrics
    lines.push('--- Cache Performance ---');
    lines.push(`  Hit Rate:        ${this.formatPercentage(metrics.cache.hitRate)}`);
    lines.push(`  Miss Rate:       ${this.formatPercentage(metrics.cache.missRate)}`);
    lines.push(`  Total Hits:      ${metrics.cache.hits.toLocaleString()}`);
    lines.push(`  Total Misses:    ${metrics.cache.misses.toLocaleString()}`);
    lines.push(`  Total Writes:    ${metrics.cache.writes.toLocaleString()}`);
    lines.push(`  Evictions:       ${metrics.cache.evictions.toLocaleString()}`);
    lines.push(`  Items in Cache:  ${metrics.cache.itemCount.toLocaleString()}`);
    lines.push(
      `  Storage Size:    ${this.formatBytes(metrics.cache.currentSizeBytes)} (${metrics.cache.currentSizeBytes.toLocaleString()} bytes)`
    );
    lines.push(
      `  Total Written:   ${this.formatBytes(metrics.cache.totalBytesWritten)} (${metrics.cache.totalBytesWritten.toLocaleString()} bytes)`
    );
    lines.push('');

    // Strategy metrics
    if (Object.keys(metrics.strategies).length > 0) {
      lines.push('--- Strategy Performance ---');
      for (const [name, stats] of Object.entries(metrics.strategies)) {
        lines.push(`  ${name}:`);
        lines.push(`    Executions:    ${stats.totalExecutions.toLocaleString()}`);
        lines.push(`    Success Rate:  ${this.formatPercentage(stats.successRate)}`);
        lines.push(`    Successes:     ${stats.successCount.toLocaleString()}`);
        lines.push(`    Failures:      ${stats.failureCount.toLocaleString()}`);
        lines.push(`    Avg Duration:  ${stats.avgDurationMs.toFixed(2)}ms`);
        lines.push(`    Total Time:    ${stats.totalDurationMs.toFixed(2)}ms`);
        lines.push(`    Fallbacks:     ${stats.fallbackCount.toLocaleString()}`);

        if (stats.errors && Object.keys(stats.errors).length > 0) {
          lines.push(`    Errors:`);
          for (const [error, count] of Object.entries(stats.errors)) {
            lines.push(`      ${error}: ${count}`);
          }
        }
      }
      lines.push('');
    }

    // Request metrics
    lines.push('--- Request Performance ---');
    lines.push(`  Total Requests:  ${metrics.requests.totalRequests.toLocaleString()}`);
    lines.push(`  Total Errors:    ${metrics.requests.totalErrors.toLocaleString()}`);
    lines.push(`  Error Rate:      ${this.formatPercentage(metrics.requests.errorRate)}`);
    lines.push(`  Avg Response:    ${metrics.requests.avgResponseTimeMs.toFixed(2)}ms`);
    lines.push('  Latency Percentiles:');
    lines.push(`    P50 (median):  ${metrics.requests.p50Ms.toFixed(2)}ms`);
    lines.push(`    P95:           ${metrics.requests.p95Ms.toFixed(2)}ms`);
    lines.push(`    P99:           ${metrics.requests.p99Ms.toFixed(2)}ms`);

    return lines.join('\n');
  }

  /**
   * Format a rate as a percentage
   */
  private formatPercentage(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`;
  }

  /**
   * Format bytes in human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  }
}
