import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCrawlTool } from "./index.js";
import type { CrawlClient, ToolResponse } from "../../types.js";

type MockFn<T extends (...args: any[]) => any> = ReturnType<typeof vi.fn<T>>;

type MockCrawlClient = CrawlClient & {
  startCrawl: MockFn<NonNullable<CrawlClient["startCrawl"]>>;
  getCrawlStatus: MockFn<NonNullable<CrawlClient["getCrawlStatus"]>>;
  cancelCrawl: MockFn<NonNullable<CrawlClient["cancelCrawl"]>>;
  getCrawlErrors: MockFn<NonNullable<CrawlClient["getCrawlErrors"]>>;
  listActiveCrawls: MockFn<NonNullable<CrawlClient["listActiveCrawls"]>>;
};

const makeMockCrawlClient = (): MockCrawlClient =>
  ({
    startCrawl: vi.fn().mockResolvedValue({
      success: true,
      id: "crawl-job-123",
      url: "https://api.firecrawl.dev/v2/crawl/crawl-job-123",
    }),
    getCrawlStatus: vi.fn().mockResolvedValue({
      status: "scraping",
      total: 100,
      completed: 50,
      creditsUsed: 50,
      expiresAt: "2025-11-06T12:00:00Z",
      data: [],
    }),
    cancelCrawl: vi.fn().mockResolvedValue({ status: "cancelled" }),
    getCrawlErrors: vi.fn().mockResolvedValue({
      errors: [{ id: "err-1", error: "boom" }],
      robotsBlocked: ["https://robots"],
    }),
    listActiveCrawls: vi.fn().mockResolvedValue({
      success: true,
      crawls: [
        {
          id: "job-1",
          teamId: "team",
          url: "https://example.com",
        },
      ],
    }),
  }) as unknown as MockCrawlClient;

describe("Crawl Tool", () => {
  let crawlClient: MockCrawlClient;
  let tool: ReturnType<typeof createCrawlTool>;
  let handler: (args: unknown) => Promise<ToolResponse>;

  beforeEach(() => {
    crawlClient = makeMockCrawlClient();
    tool = createCrawlTool(crawlClient);
    handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
  });

  it("should create crawl tool with proper structure", () => {
    expect(tool.name).toBe("crawl");
    expect(tool.description).toContain("crawl");
    expect(tool.inputSchema).toBeDefined();
  });

  it("should start crawl when url is provided", async () => {
    const result = await handler({
      command: "start",
      url: "https://example.com",
      limit: 100,
    });

    expect(crawlClient.startCrawl).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("crawl-job-123");
  });

  it("should check status when only jobId is provided", async () => {
    const result = await handler({ command: "status", jobId: "crawl-job-123" });

    expect(crawlClient.getCrawlStatus).toHaveBeenCalledWith("crawl-job-123");
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("Crawl Status:");
  });

  it("should cancel crawl when jobId and cancel=true", async () => {
    const result = await handler({ command: "cancel", jobId: "crawl-job-123" });

    expect(crawlClient.cancelCrawl).toHaveBeenCalledWith("crawl-job-123");
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("cancelled");
  });

  it("should pass prompt parameter to API when provided", async () => {
    await handler({
      command: "start",
      url: "https://example.com",
      prompt: "Find all blog posts about AI",
    });

    expect(crawlClient.startCrawl).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Find all blog posts about AI" }),
    );
  });

  it("returns crawl errors when requested", async () => {
    const result = await handler({ command: "errors", jobId: "job-1" });

    expect(crawlClient.getCrawlErrors).toHaveBeenCalledWith("job-1");
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("Robots");
  });

  it("lists active crawls", async () => {
    const result = await handler({ command: "list" });

    expect(crawlClient.listActiveCrawls).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("Active Crawls");
  });
});
