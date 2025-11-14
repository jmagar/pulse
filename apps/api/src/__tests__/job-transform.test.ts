import { FirecrawlJob } from "../types";
import { transformJobForLogging, createJobLoggerContext } from "../lib/job-transform";

describe("Job Transformation", () => {
  it("should transform job correctly for database logging", () => {
    const testJob: Partial<FirecrawlJob> = {
      job_id: "test-job-123",
      success: true,
      message: "Test job completed",
      num_docs: 5,
      docs: [{ content: "test content", html: "<p>test</p>" }],
      time_taken: 1500,
      team_id: "test-team",
      mode: "scrape",
      url: "https://example.com",
      crawlerOptions: { maxDepth: 1 },
      scrapeOptions: { includeHtml: true },
      origin: "test-origin",
      num_tokens: 100,
      retry: false,
      tokens_billed: 100,
    };

    const transformed = transformJobForLogging(testJob as FirecrawlJob, {
      includeTimestamp: false,
      serializeObjects: false,
      cleanNullValues: true,
    });

    expect(transformed).toHaveProperty("job_id", "test-job-123");
    expect(transformed).toHaveProperty("success", true);
    expect(transformed).toHaveProperty("message", "Test job completed");
    expect(transformed).toHaveProperty("num_docs", 5);
    expect(transformed).toHaveProperty("time_taken", 1500);
    expect(transformed).toHaveProperty("team_id", "test-team");
    expect(transformed).toHaveProperty("mode", "scrape");
    expect(transformed).toHaveProperty("url", "https://example.com");
    expect(transformed).toHaveProperty("is_migrated", true);
    expect(transformed).not.toHaveProperty("timestamp");
    expect(typeof transformed.crawler_options).toBe("object");
    expect(typeof transformed.page_options).toBe("object");
  });

  it("should transform job correctly for BigQuery logging", () => {
    const testJob: Partial<FirecrawlJob> = {
      job_id: "test-job-123",
      success: true,
      message: "Test job completed",
      num_docs: 5,
      docs: [{ content: "test content", html: "<p>test</p>" }],
      time_taken: 1500,
      team_id: "test-team",
      mode: "scrape",
      url: "https://example.com",
      crawlerOptions: { maxDepth: 1 },
      scrapeOptions: { includeHtml: true },
      origin: "test-origin",
      num_tokens: 100,
      retry: false,
      tokens_billed: 100,
    };

    const transformed = transformJobForLogging(testJob as FirecrawlJob, {
      includeTimestamp: true,
      serializeObjects: true,
      cleanNullValues: false,
    });

    expect(transformed).toHaveProperty("job_id", "test-job-123");
    expect(transformed).toHaveProperty("success", true);
    expect(transformed).toHaveProperty("timestamp");
    expect(typeof transformed.crawler_options).toBe("string");
    expect(typeof transformed.page_options).toBe("string");
    expect(typeof transformed.docs).toBe("string");
  });

  it("should handle zero data retention correctly", () => {
    const testJob: Partial<FirecrawlJob> = {
      job_id: "test-job-zdr",
      success: true,
      message: "Sensitive data",
      url: "https://sensitive.example.com",
      crawlerOptions: { sensitive: "data" },
      scrapeOptions: { headers: { Authorization: "Bearer token" } },
      origin: "sensitive-origin",
      zeroDataRetention: true,
    };

    const transformed = transformJobForLogging(testJob as FirecrawlJob);

    expect(transformed.message).toBeNull();
    expect(transformed.url).toBe("<redacted due to zero data retention>");
    expect(transformed.crawler_options).toBeNull();
    expect(transformed.page_options).toBeNull();
    expect(transformed.origin).toBeNull();
    expect(transformed.docs).toBeNull();
  });

  it("should handle preview team correctly", () => {
    const testJob: Partial<FirecrawlJob> = {
      job_id: "test-job-preview",
      team_id: "preview",
      mode: "scrape",
    };

    const transformed = transformJobForLogging(testJob as FirecrawlJob);
    expect(transformed.team_id).toBeNull();
  });

  it("should handle preview_ prefixed team correctly", () => {
    const testJob: Partial<FirecrawlJob> = {
      job_id: "test-job-preview-prefixed",
      team_id: "preview_test123",
      mode: "scrape",
    };

    const transformed = transformJobForLogging(testJob as FirecrawlJob);
    expect(transformed.team_id).toBeNull();
  });

  it("should handle docs exclusion for GCS storage", () => {
    // Set GCS_BUCKET_NAME environment variable
    const originalEnv = process.env.GCS_BUCKET_NAME;
    process.env.GCS_BUCKET_NAME = "test-bucket";

    const testJob: Partial<FirecrawlJob> = {
      job_id: "test-job-gcs",
      mode: "scrape",
      docs: [{ content: "test content", html: "<p>test</p>" }],
    };

    const transformed = transformJobForLogging(testJob as FirecrawlJob);
    expect(transformed.docs).toBeNull();

    // Restore environment
    if (originalEnv) {
      process.env.GCS_BUCKET_NAME = originalEnv;
    } else {
      delete process.env.GCS_BUCKET_NAME;
    }
  });

  it("should clean null values when requested", () => {
    const testJob: Partial<FirecrawlJob> = {
      job_id: "test-job-clean",
      docs: [{ content: "test\u0000content", html: "<p>test\u0000</p>" }],
      mode: "scrape",
    };

    const transformed = transformJobForLogging(testJob as FirecrawlJob, {
      cleanNullValues: true,
    });

    expect(JSON.stringify(transformed.docs)).not.toContain("\\u0000");
  });

  describe("Logger Context Creation", () => {
    it("should create correct context for scrape job", () => {
      const job: Partial<FirecrawlJob> = {
        job_id: "scrape-123",
        mode: "scrape",
      };

      const context = createJobLoggerContext(job as FirecrawlJob);
      expect(context).toHaveProperty("scrapeId", "scrape-123");
      expect(context).not.toHaveProperty("crawlId");
      expect(context).not.toHaveProperty("extractId");
    });

    it("should create correct context for crawl job", () => {
      const job: Partial<FirecrawlJob> = {
        job_id: "crawl-456",
        mode: "crawl",
      };

      const context = createJobLoggerContext(job as FirecrawlJob);
      expect(context).toHaveProperty("crawlId", "crawl-456");
      expect(context).not.toHaveProperty("scrapeId");
      expect(context).not.toHaveProperty("extractId");
    });

    it("should create correct context for extract job", () => {
      const job: Partial<FirecrawlJob> = {
        job_id: "extract-789",
        mode: "extract",
      };

      const context = createJobLoggerContext(job as FirecrawlJob);
      expect(context).toHaveProperty("extractId", "extract-789");
      expect(context).not.toHaveProperty("scrapeId");
      expect(context).not.toHaveProperty("crawlId");
    });

    it("should create correct context for single_urls job", () => {
      const job: Partial<FirecrawlJob> = {
        job_id: "single-urls-123",
        mode: "single_urls",
      };

      const context = createJobLoggerContext(job as FirecrawlJob);
      expect(context).toHaveProperty("scrapeId", "single-urls-123");
    });

    it("should create correct context for batch_scrape job", () => {
      const job: Partial<FirecrawlJob> = {
        job_id: "batch-scrape-456",
        mode: "batch_scrape",
      };

      const context = createJobLoggerContext(job as FirecrawlJob);
      expect(context).toHaveProperty("crawlId", "batch-scrape-456");
    });
  });
});
