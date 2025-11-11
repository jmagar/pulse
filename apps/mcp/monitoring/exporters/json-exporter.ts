/**
 * @fileoverview JSON metrics exporter
 *
 * Exports metrics in structured JSON format suitable for logging systems,
 * monitoring dashboards, and programmatic consumption.
 *
 * @module shared/monitoring/exporters/json-exporter
 */

import type { AllMetrics, MetricsExporter } from "../types.js";

/**
 * JSONExporter - Formats metrics as JSON
 *
 * Provides structured JSON output that can be consumed by monitoring
 * systems, logging aggregators, or other tools.
 */
export class JSONExporter implements MetricsExporter {
  private readonly pretty: boolean;

  constructor(options: { pretty?: boolean } = {}) {
    this.pretty = options.pretty ?? false;
  }

  /**
   * Export metrics as JSON
   * @param metrics The metrics to export
   * @returns JSON string representation of metrics
   */
  export(metrics: AllMetrics): string {
    if (this.pretty) {
      return JSON.stringify(metrics, null, 2);
    }
    return JSON.stringify(metrics);
  }
}
