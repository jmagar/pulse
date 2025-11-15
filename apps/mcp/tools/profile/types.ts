/**
 * API response types matching webhook schemas
 */

export interface OperationTimingSummary {
  chunking_ms: number;
  embedding_ms: number;
  qdrant_ms: number;
  bm25_ms: number;
}

export interface PerPageMetric {
  url: string | null;
  operation_type: string;
  operation_name: string;
  duration_ms: number;
  success: boolean;
  timestamp: string;
}

export interface CrawlMetricsResponse {
  crawl_id: string;
  crawl_url: string;
  status: string;
  success: boolean | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  e2e_duration_ms: number | null;
  total_pages: number;
  pages_indexed: number;
  pages_failed: number;
  aggregate_timing: OperationTimingSummary;
  per_page_metrics?: PerPageMetric[];
  error_message: string | null;
  extra_metadata: Record<string, unknown> | null;
}
