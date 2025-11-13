import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IScrapingClients } from "../../mcp-server.js";
import {
  shouldUseBatchScrape,
  createBatchScrapeOptions,
  startBatchScrapeJob,
  runBatchScrapeCommand,
  scrapeContent,
} from "./pipeline.js";
import { scrapeWithStrategy } from "../../scraping/strategies/selector.js";

vi.mock("../../scraping/strategies/selector.js", () => ({
  scrapeWithStrategy: vi.fn(),
}));

const mockedScrapeWithStrategy = vi.mocked(scrapeWithStrategy);

const buildClients = (
  overrides: Partial<NonNullable<IScrapingClients["firecrawl"]>> = {},
) => {
  const firecrawl = {
    batchScrape: vi.fn(),
    getBatchScrapeStatus: vi.fn(),
    cancelBatchScrape: vi.fn(),
    getBatchScrapeErrors: vi.fn(),
    ...overrides,
  };

  return {
    native: {} as IScrapingClients["native"],
    firecrawl: firecrawl as IScrapingClients["firecrawl"],
  } satisfies IScrapingClients;
};

describe("shouldUseBatchScrape", () => {
  it("returns true only when more than one url provided", () => {
    expect(shouldUseBatchScrape(undefined)).toBe(false);
    expect(shouldUseBatchScrape([])).toBe(false);
    expect(shouldUseBatchScrape(["https://one.example"])).toBe(false);
    expect(
      shouldUseBatchScrape(["https://one.example", "https://two.example"]),
    ).toBe(true);
  });
});

describe("createBatchScrapeOptions", () => {
  it("maps supported scrape options to Firecrawl payload", () => {
    const options = createBatchScrapeOptions({
      urls: ["https://one.example", "https://two.example"],
      timeout: 120000,
      maxAge: 1000,
      proxy: "stealth",
      blockAds: false,
      headers: { Authorization: "Bearer test" },
      waitFor: 2000,
      includeTags: ["article"],
      excludeTags: ["nav"],
      formats: ["markdown", "html"],
      parsers: [{ type: "pdf", maxPages: 10 }],
      onlyMainContent: false,
      actions: [{ type: "wait", milliseconds: 500 }],
    });

    expect(options).toEqual({
      urls: ["https://one.example", "https://two.example"],
      timeout: 120000,
      maxAge: 1000,
      proxy: "stealth",
      blockAds: false,
      headers: { Authorization: "Bearer test" },
      waitFor: 2000,
      includeTags: ["article"],
      excludeTags: ["nav"],
      formats: ["markdown", "html"],
      parsers: [{ type: "pdf", maxPages: 10 }],
      onlyMainContent: false,
      actions: [{ type: "wait", milliseconds: 500 }],
    });
  });
});

describe("startBatchScrapeJob", () => {
  it("throws a helpful error when firecrawl client is unavailable", async () => {
    await expect(
      startBatchScrapeJob(
        { native: {} } as IScrapingClients,
        {
          urls: ["https://one.example", "https://two.example"],
        },
      ),
    ).rejects.toThrow("Firecrawl batch scraping requires");
  });

  it("delegates to firecrawl.batchScrape with normalized options", async () => {
    const clients = buildClients();
    const mockResult = {
      success: true,
      id: "batch-job-1",
      url: "https://status",
      invalidURLs: [],
    };
    (clients.firecrawl!.batchScrape as any).mockResolvedValue(mockResult);

    const result = await startBatchScrapeJob(clients, {
      urls: ["https://one.example", "https://two.example"],
    });

    expect(clients.firecrawl!.batchScrape).toHaveBeenCalledWith({
      urls: ["https://one.example", "https://two.example"],
    });
    expect(result).toEqual(mockResult);
  });
});

describe("runBatchScrapeCommand", () => {
  it("routes status command", async () => {
    const clients = buildClients();
    (clients.firecrawl!.getBatchScrapeStatus as any).mockResolvedValue({
      status: "scraping",
      total: 10,
      completed: 3,
      creditsUsed: 5,
      expiresAt: "2025-11-12T00:00:00Z",
      data: [],
    });

    const result = await runBatchScrapeCommand(clients, "status", "job-1");

    expect(clients.firecrawl!.getBatchScrapeStatus).toHaveBeenCalledWith(
      "job-1",
    );
    if ("status" in result) {
      expect(result.status).toBe("scraping");
    } else {
      throw new Error("Expected status result");
    }
  });

  it("routes cancel command", async () => {
    const clients = buildClients();
    (clients.firecrawl!.cancelBatchScrape as any).mockResolvedValue({
      success: true,
      message: "Cancelled",
    });

    const result = await runBatchScrapeCommand(clients, "cancel", "job-1");

    expect(clients.firecrawl!.cancelBatchScrape).toHaveBeenCalledWith("job-1");
    expect(result).toEqual({ success: true, message: "Cancelled" });
  });

  it("routes errors command", async () => {
    const clients = buildClients();
    (clients.firecrawl!.getBatchScrapeErrors as any).mockResolvedValue({
      errors: [{ error: "boom", url: "https://example" }],
      robotsBlocked: [],
    });

    const result = await runBatchScrapeCommand(clients, "errors", "job-1");

    expect(clients.firecrawl!.getBatchScrapeErrors).toHaveBeenCalledWith(
      "job-1",
    );
    if ("errors" in result) {
      expect(result.errors[0].error).toBe("boom");
    } else {
      throw new Error("Expected errors result");
    }
  });

  it("throws when firecrawl client is missing", async () => {
    await expect(
      runBatchScrapeCommand(
        { native: {} } as IScrapingClients,
        "status",
        "job-1",
      ),
    ).rejects.toThrow("Firecrawl batch scraping requires");
  });
});

describe("scrapeContent auto crawl prevention", () => {
  const strategyClient = {} as any;

  beforeEach(() => {
    mockedScrapeWithStrategy.mockReset();
  });

  it("does not call firecrawl.startCrawl when screenshot scrape succeeds", async () => {
    const firecrawl = {
      scrape: vi.fn().mockResolvedValue({
        success: true,
        data: {
          html: "<html/>",
          screenshot: "base64payload",
          metadata: { screenshotMetadata: { format: "png" } },
        },
      }),
      startCrawl: vi.fn(),
    };

    await scrapeContent(
      "https://example.com/page",
      60000,
      { native: {} as any, firecrawl },
      strategyClient,
      { formats: ["screenshot"] },
    );

    expect(firecrawl.startCrawl).not.toHaveBeenCalled();
  });

  it("does not call firecrawl.startCrawl during strategy scraping", async () => {
    mockedScrapeWithStrategy.mockResolvedValue({
      success: true,
      content: "<html/>",
      source: "native",
    });
    const firecrawl = {
      startCrawl: vi.fn(),
    };

    await scrapeContent(
      "https://example.com/docs",
      60000,
      { native: {} as any, firecrawl: firecrawl as any },
      strategyClient,
      {},
    );

    expect(firecrawl.startCrawl).not.toHaveBeenCalled();
  });
});
