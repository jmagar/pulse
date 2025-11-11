/**
 * @fileoverview Metrics middleware for remote server
 *
 * Provides HTTP endpoints for accessing performance metrics:
 * - GET /metrics - Console-formatted metrics
 * - GET /metrics/json - JSON-formatted metrics
 *
 * @module remote/middleware/metrics
 */

import type { Request, Response } from "express";
import {
  getMetricsCollector,
  ConsoleExporter,
  JSONExporter,
} from "../../monitoring/index.js";

/**
 * Handle GET /metrics - Returns console-formatted metrics
 */
export function getMetricsConsole(req: Request, res: Response): void {
  try {
    const collector = getMetricsCollector();
    const metrics = collector.getAllMetrics();
    const exporter = new ConsoleExporter({ includeTimestamp: true });
    const output = exporter.export(metrics);

    res.set("Content-Type", "text/plain");
    res.send(output);
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate metrics",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Handle GET /metrics/json - Returns JSON-formatted metrics
 */
export function getMetricsJSON(req: Request, res: Response): void {
  try {
    const collector = getMetricsCollector();
    const metrics = collector.getAllMetrics();
    const exporter = new JSONExporter({ pretty: true });
    const output = exporter.export(metrics);

    res.set("Content-Type", "application/json");
    res.send(output);
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate metrics",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Handle POST /metrics/reset - Resets all metrics (for testing/debugging)
 */
export function resetMetrics(req: Request, res: Response): void {
  try {
    const collector = getMetricsCollector();
    collector.reset();

    res.json({
      success: true,
      message: "Metrics reset successfully",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to reset metrics",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
