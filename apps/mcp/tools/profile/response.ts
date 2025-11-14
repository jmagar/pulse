import type { CrawlMetricsResponse, PerPageMetric } from "./types.js";
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
 * Build error section from per-page metrics
 */
function buildErrorSection(
  metrics: CrawlMetricsResponse,
  options: Partial<ProfileOptions>
): string {
  if (!metrics.per_page_metrics || metrics.per_page_metrics.length === 0) {
    return "";
  }

  // Filter to failed operations
  const errors = metrics.per_page_metrics
    .filter((m) => !m.success)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  if (errors.length === 0) {
    return "";
  }

  // Apply pagination
  const { error_offset = 0, error_limit = 5 } = options;
  const paginatedErrors = errors.slice(error_offset, error_offset + error_limit);
  const hasMore = errors.length > error_offset + error_limit;

  // Group by operation type
  const errorsByType = new Map<string, PerPageMetric[]>();
  for (const error of paginatedErrors) {
    const type = error.operation_type;
    if (!errorsByType.has(type)) {
      errorsByType.set(type, []);
    }
    errorsByType.get(type)!.push(error);
  }

  let output = `\n⚠️ Errors Encountered: ${errors.length} operation${
    errors.length === 1 ? "" : "s"
  } failed`;
  if (errors.length > error_limit) {
    output += ` (showing ${paginatedErrors.length} of ${errors.length})`;
  }
  output += "\n\n";

  // Format errors by type
  for (const [type, typeErrors] of errorsByType) {
    output += `${type.charAt(0).toUpperCase() + type.slice(1)} Errors (${
      typeErrors.length
    }):\n`;
    for (const error of typeErrors) {
      const url = error.url || "(unknown page)";
      const timestamp = formatTimestamp(error.timestamp);
      output += `├─ ${url} (${timestamp})\n`;
      output += `│  └─ Error: ${error.operation_name} failed\n`;
    }
    output += "\n";
  }

  // Pagination hint
  if (hasMore) {
    const remaining = errors.length - error_offset - error_limit;
    output += `📄 ${remaining} more error${remaining === 1 ? "" : "s"} available. `;
    output += `Use error_offset=${error_offset + error_limit} to see next page.\n`;
  }

  return output;
}

/**
 * Build performance insights section
 */
function buildInsights(metrics: CrawlMetricsResponse): string {
  const { aggregate_timing, total_pages } = metrics;
  const totalIndexing =
    aggregate_timing.chunking_ms +
    aggregate_timing.embedding_ms +
    aggregate_timing.qdrant_ms +
    aggregate_timing.bm25_ms;

  if (totalIndexing === 0) {
    return "";
  }

  let insights = "\n💡 Insights:\n";

  // Find slowest operation
  const operations = [
    { name: "Chunking", ms: aggregate_timing.chunking_ms },
    { name: "Embedding", ms: aggregate_timing.embedding_ms },
    { name: "Qdrant", ms: aggregate_timing.qdrant_ms },
    { name: "BM25", ms: aggregate_timing.bm25_ms },
  ];
  const slowest = operations.reduce((a, b) => (a.ms > b.ms ? a : b));

  const slowestPercent = percentage(slowest.ms, totalIndexing);
  insights += `- ${slowest.name} accounts for ${slowestPercent} of indexing time `;
  insights += `(${slowest.ms.toLocaleString()}ms / ${totalIndexing.toLocaleString()}ms)\n`;

  // Per-page averages
  if (total_pages > 0) {
    const avgPerPage = Math.round(totalIndexing / total_pages);
    insights += `- Average ${avgPerPage.toLocaleString()}ms/page for indexing\n`;

    if (aggregate_timing.embedding_ms > 0) {
      const avgEmbedding = Math.round(
        aggregate_timing.embedding_ms / total_pages
      );
      insights += `- Average ${avgEmbedding.toLocaleString()}ms/page for embeddings`;
      if (avgEmbedding > 1000) {
        insights += ` - consider optimizing batch size`;
      }
      insights += "\n";
    }
  }

  // Failure rate
  if (metrics.pages_failed > 0) {
    const failureRate = percentage(metrics.pages_failed, total_pages);
    insights += `- ${failureRate} failure rate (${metrics.pages_failed}/${total_pages} pages)\n`;
  }

  return insights;
}

/**
 * Format profile response for Claude
 */
export function formatProfileResponse(
  metrics: CrawlMetricsResponse,
  options: Partial<ProfileOptions>
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

  // Errors (from per-page metrics)
  const errorSection = buildErrorSection(metrics, options);
  if (errorSection) {
    lines.push(errorSection);
  }

  // Insights
  const insights = buildInsights(metrics);
  if (insights) {
    lines.push(insights);
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
