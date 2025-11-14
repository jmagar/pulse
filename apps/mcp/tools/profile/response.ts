import type { CrawlMetricsResponse } from "./types.js";
import type { ProfileOptions } from "./schema.js";

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number | null): string {
  if (ms === null) return "N/A";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s (${ms.toLocaleString()}ms)`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s (${ms.toLocaleString()}ms)`;
  }
  return `${seconds}s (${ms.toLocaleString()}ms)`;
}

/**
 * Format timestamp in EST
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return (
    date.toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " EST"
  );
}

/**
 * Calculate percentage of total
 */
function percentage(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

/**
 * Format profile response for Claude
 */
export function formatProfileResponse(
  metrics: CrawlMetricsResponse,
  options: ProfileOptions
): ToolResponse {
  const lines: string[] = [];

  // Header
  lines.push(`Crawl Performance Profile: ${metrics.crawl_id}`);
  lines.push(`URL: ${metrics.crawl_url}`);

  // Status
  const statusIcon =
    metrics.status === "completed"
      ? "✓"
      : metrics.status === "failed"
      ? "❌"
      : "🔄";
  const successText =
    metrics.success === true
      ? "(succeeded)"
      : metrics.success === false
      ? "(failed)"
      : "";
  lines.push(`Status: ${metrics.status} ${statusIcon} ${successText}`);

  // Timestamps
  lines.push(`Started: ${formatTimestamp(metrics.started_at)}`);
  if (metrics.completed_at) {
    lines.push(`Completed: ${formatTimestamp(metrics.completed_at)}`);
  }
  if (metrics.duration_ms !== null) {
    lines.push(`Duration: ${formatDuration(metrics.duration_ms)}`);
  }

  // Pages
  lines.push("");
  lines.push(`Pages Processed: ${metrics.total_pages} total`);
  lines.push(`├─ Indexed: ${metrics.pages_indexed} pages`);
  lines.push(`└─ Failed: ${metrics.pages_failed} pages`);

  // Performance breakdown
  const { aggregate_timing } = metrics;
  const totalIndexing =
    aggregate_timing.chunking_ms +
    aggregate_timing.embedding_ms +
    aggregate_timing.qdrant_ms +
    aggregate_timing.bm25_ms;

  if (totalIndexing > 0) {
    lines.push("");
    lines.push("Performance Breakdown (aggregate):");
    lines.push(
      `├─ Chunking:   ${aggregate_timing.chunking_ms.toLocaleString()}ms (${percentage(
        aggregate_timing.chunking_ms,
        totalIndexing
      )})`
    );
    lines.push(
      `├─ Embedding: ${aggregate_timing.embedding_ms.toLocaleString()}ms (${percentage(
        aggregate_timing.embedding_ms,
        totalIndexing
      )})`
    );
    lines.push(
      `├─ Qdrant:     ${aggregate_timing.qdrant_ms.toLocaleString()}ms (${percentage(
        aggregate_timing.qdrant_ms,
        totalIndexing
      )})`
    );
    lines.push(
      `└─ BM25:       ${aggregate_timing.bm25_ms.toLocaleString()}ms (${percentage(
        aggregate_timing.bm25_ms,
        totalIndexing
      )})`
    );

    lines.push("");
    lines.push(`Indexing time: ${totalIndexing.toLocaleString()}ms total`);
    if (metrics.total_pages > 0) {
      const avgPerPage = Math.round(totalIndexing / metrics.total_pages);
      lines.push(`Per-page average: ${avgPerPage.toLocaleString()}ms/page`);
    }
  }

  // End-to-end latency
  if (metrics.e2e_duration_ms !== null) {
    lines.push("");
    lines.push(
      `End-to-end latency: ${formatDuration(metrics.e2e_duration_ms)} (from MCP request to completion)`
    );
  }

  // Crawl-level error
  if (metrics.error_message) {
    lines.push("");
    lines.push(`❌ Crawl Error: ${metrics.error_message}`);
  }

  // In-progress hint
  if (metrics.status === "in_progress") {
    lines.push("");
    lines.push(
      "💡 Crawl is still in progress. Use profile_crawl again to see updated metrics."
    );
  }

  return {
    content: [
      {
        type: "text",
        text: lines.join("\n"),
      },
    ],
  };
}

/**
 * Format error response
 */
export function formatErrorResponse(error: Error): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: `Profile error: ${error.message}`,
      },
    ],
    isError: true,
  };
}
