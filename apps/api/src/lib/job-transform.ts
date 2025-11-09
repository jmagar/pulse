import { FirecrawlJob } from "../types";

function cleanOfNull<T>(x: T): T {
  if (Array.isArray(x)) {
    return x.map(x => cleanOfNull(x)) as T;
  } else if (typeof x === "object" && x !== null) {
    return Object.fromEntries(
      Object.entries(x).map(([k, v]) => [k, cleanOfNull(v)]),
    ) as T;
  } else if (typeof x === "string") {
    return x.replaceAll("\u0000", "") as T;
  } else {
    return x;
  }
}

interface TransformOptions {
  /** Whether to include timestamp field (for BigQuery) */
  includeTimestamp?: boolean;
  /** Whether to serialize objects to JSON strings (for BigQuery) */
  serializeObjects?: boolean;
  /** Whether to clean null values from docs */
  cleanNullValues?: boolean;
}

/**
 * Transforms a FirecrawlJob into a standardized format for logging/storage
 */
export function transformJobForLogging(
  job: FirecrawlJob,
  options: TransformOptions = {},
) {
  const {
    includeTimestamp = false,
    serializeObjects = false,
    cleanNullValues = true,
  } = options;

  const zeroDataRetention = job.zeroDataRetention ?? false;

  // Determine if docs should be included based on zero data retention and GCS usage
  const shouldIncludeDocs =
    !zeroDataRetention &&
    !(
      (job.mode === "single_urls" || job.mode === "scrape") &&
      process.env.GCS_BUCKET_NAME
    );

  const baseTransform = {
    job_id: job.job_id ? job.job_id : null,
    success: job.success,
    message: zeroDataRetention ? null : job.message,
    num_docs: job.num_docs,
    docs: shouldIncludeDocs
      ? cleanNullValues
        ? cleanOfNull(job.docs)
        : job.docs
      : null,
    time_taken: job.time_taken,
    team_id:
      job.team_id === "preview" || job.team_id?.startsWith("preview_")
        ? null
        : job.team_id,
    mode: job.mode,
    url: zeroDataRetention ? "<redacted due to zero data retention>" : job.url,
    crawler_options: zeroDataRetention ? null : job.crawlerOptions,
    page_options: zeroDataRetention ? null : job.scrapeOptions,
    origin: zeroDataRetention ? null : job.origin,
    integration: zeroDataRetention ? null : (job.integration ?? null),
    num_tokens: job.num_tokens,
    retry: !!job.retry,
    crawl_id: job.crawl_id,
    tokens_billed: job.tokens_billed,
    is_migrated: true,
    cost_tracking: zeroDataRetention ? null : job.cost_tracking,
    pdf_num_pages: zeroDataRetention ? null : (job.pdf_num_pages ?? null),
    credits_billed: job.credits_billed ?? null,
    change_tracking_tag: zeroDataRetention
      ? null
      : (job.change_tracking_tag ?? null),
    dr_clean_by:
      zeroDataRetention && job.crawl_id
        ? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
        : null,
  };

  // Add timestamp if requested (for BigQuery)
  const withTimestamp = includeTimestamp
    ? { ...baseTransform, timestamp: new Date().toISOString() }
    : baseTransform;

  // Serialize objects to JSON strings if requested (for BigQuery)
  if (serializeObjects) {
    return {
      ...withTimestamp,
      docs: withTimestamp.docs ? JSON.stringify(withTimestamp.docs) : null,
      crawler_options: withTimestamp.crawler_options
        ? JSON.stringify(withTimestamp.crawler_options)
        : null,
      page_options: withTimestamp.page_options
        ? JSON.stringify(withTimestamp.page_options)
        : null,
      cost_tracking: withTimestamp.cost_tracking
        ? JSON.stringify(withTimestamp.cost_tracking)
        : null,
    };
  }

  return withTimestamp;
}

/**
 * Creates logger context based on job mode and ID
 */
export function createJobLoggerContext(job: FirecrawlJob) {
  return {
    ...(job.mode === "scrape" ||
    job.mode === "single_urls" ||
    job.mode === "single_url"
      ? {
          scrapeId: job.job_id,
        }
      : {}),
    ...(job.mode === "crawl" || job.mode === "batch_scrape"
      ? {
          crawlId: job.job_id,
        }
      : {}),
    ...(job.mode === "extract"
      ? {
          extractId: job.job_id,
        }
      : {}),
  };
}
