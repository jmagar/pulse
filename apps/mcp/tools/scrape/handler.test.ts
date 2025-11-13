import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleScrapeRequest } from "./handler.js";
import type { IScrapingClients } from "../../mcp-server.js";

const pipelineMocks = vi.hoisted(() => {
  return {
    checkCache: vi.fn().mockResolvedValue({ found: false }),
    scrapeContent: vi.fn(),
    processContent: vi.fn(),
    saveToStorage: vi.fn(),
    shouldUseBatchScrape: vi.fn().mockReturnValue(false),
    createBatchScrapeOptions: vi.fn(),
    startBatchScrapeJob: vi.fn(),
    runBatchScrapeCommand: vi.fn(),
  };
});

const responseMocks = vi.hoisted(() => {
  return {
    buildCachedResponse: vi.fn(),
    buildErrorResponse: vi.fn(),
    buildSuccessResponse: vi.fn(),
    buildBatchStartResponse: vi.fn(),
    buildBatchStatusResponse: vi.fn(),
    buildBatchCancelResponse: vi.fn(),
    buildBatchErrorsResponse: vi.fn(),
    buildBatchCommandError: vi.fn(),
  };
});

vi.mock("./pipeline.js", () => pipelineMocks);
vi.mock("./response.js", () => responseMocks);

const createClients = () =>
  ({
    native: {
      scrape: vi.fn(),
    },
    firecrawl: {
      scrape: vi.fn(),
      batchScrape: vi.fn(),
      getBatchScrapeStatus: vi.fn(),
      cancelBatchScrape: vi.fn(),
      getBatchScrapeErrors: vi.fn(),
    },
  }) as unknown as IScrapingClients;

const createStrategyClient = () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  upsertEntry: vi.fn(),
  getStrategyForUrl: vi.fn(),
});

const strategyFactory = vi.fn(() => createStrategyClient());

describe("handleScrapeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelineMocks.checkCache.mockResolvedValue({ found: false });
    pipelineMocks.scrapeContent.mockResolvedValue({
      success: true,
      content: "html",
      source: "native",
    });
    pipelineMocks.processContent.mockResolvedValue({
      cleaned: "clean",
      extracted: undefined,
      displayContent: "clean",
    });
    pipelineMocks.saveToStorage.mockResolvedValue({
      raw: "raw://resource",
    });
    responseMocks.buildSuccessResponse.mockReturnValue({
      content: [{ type: "text", text: "ok" }],
    });
  });

  it("routes multi-url start requests through batch pipeline", async () => {
    pipelineMocks.shouldUseBatchScrape.mockReturnValue(true);
    pipelineMocks.createBatchScrapeOptions.mockReturnValue({
      urls: ["https://one.example", "https://two.example"],
    });
    pipelineMocks.startBatchScrapeJob.mockResolvedValue({
      success: true,
      id: "batch-job-1",
      url: "https://status",
    });
    responseMocks.buildBatchStartResponse.mockReturnValue({
      content: [{ type: "text", text: "batch" }],
    });

    const response = await handleScrapeRequest(
      { urls: ["https://one.example", "https://two.example"] },
      () => createClients(),
      strategyFactory,
    );

    expect(pipelineMocks.startBatchScrapeJob).toHaveBeenCalled();
    expect(responseMocks.buildBatchStartResponse).toHaveBeenCalledWith(
      { success: true, id: "batch-job-1", url: "https://status" },
      2,
    );
    expect(response.content[0].text).toBe("batch");
  });

  it("routes status command to batch status response", async () => {
    pipelineMocks.runBatchScrapeCommand.mockResolvedValue({
      status: "scraping",
      total: 10,
      completed: 5,
      creditsUsed: 2,
      expiresAt: "soon",
      data: [],
    });
    responseMocks.buildBatchStatusResponse.mockReturnValue({
      content: [{ type: "text", text: "status" }],
    });

    const response = await handleScrapeRequest(
      { command: "status", jobId: "job-1" },
      () => createClients(),
      strategyFactory,
    );

    expect(pipelineMocks.runBatchScrapeCommand).toHaveBeenCalledWith(
      expect.anything(),
      "status",
      "job-1",
    );
    expect(response.content[0].text).toBe("status");
  });
});
