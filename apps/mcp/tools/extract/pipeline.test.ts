import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { extractPipeline } from "./pipeline.js";
import type { ExtractOptions } from "./schema.js";

// Define types inline since they don't exist in @firecrawl/client yet
interface ExtractResult {
  success: boolean;
  data?: Array<Record<string, unknown>>;
  error?: string;
}

interface ClientExtractOptions {
  urls: string[];
  prompt?: string;
  schema?: Record<string, unknown>;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
    includeTags?: string[];
    excludeTags?: string[];
    waitFor?: number;
  };
  timeout?: number;
}

describe("Extract Pipeline", () => {
  let mockClient: {
    extract: Mock<(options: ClientExtractOptions) => Promise<ExtractResult>>;
  };

  beforeEach(() => {
    mockClient = {
      extract: vi.fn() as Mock<
        (options: ClientExtractOptions) => Promise<ExtractResult>
      >,
    };
  });

  it("should call client.extract() with correct options", async () => {
    mockClient.extract.mockResolvedValue({
      success: true,
      data: [{ name: "John", email: "john@example.com" }],
    });

    const options: ExtractOptions = {
      urls: ["https://example.com"],
      prompt: "Extract contact information",
      timeout: 30000,
    };

    const result = await extractPipeline(mockClient, options);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(mockClient.extract).toHaveBeenCalledWith({
      urls: ["https://example.com"],
      prompt: "Extract contact information",
      schema: undefined,
      timeout: 30000,
    });
  });

  it("should pass urls, prompt, and schema to client", async () => {
    mockClient.extract.mockResolvedValue({
      success: true,
      data: [{ title: "Test Article", author: "Jane Doe" }],
    });

    const testSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        author: { type: "string" },
      },
    };

    const options: ExtractOptions = {
      urls: ["https://example.com/article", "https://example.com/blog"],
      schema: testSchema,
    };

    await extractPipeline(mockClient, options);

    expect(mockClient.extract).toHaveBeenCalledWith({
      urls: ["https://example.com/article", "https://example.com/blog"],
      prompt: undefined,
      schema: testSchema,
      timeout: undefined,
    });
  });

  it("should include scrapeOptions when provided", async () => {
    mockClient.extract.mockResolvedValue({
      success: true,
      data: [{ title: "Test" }],
    });

    const options: ExtractOptions = {
      urls: ["https://example.com"],
      prompt: "Extract title",
      scrapeOptions: {
        formats: ["markdown", "html"],
        onlyMainContent: true,
        includeTags: ["article", "main"],
        excludeTags: ["nav", "footer"],
        waitFor: 2000,
      },
    };

    await extractPipeline(mockClient, options);

    expect(mockClient.extract).toHaveBeenCalledWith({
      urls: ["https://example.com"],
      prompt: "Extract title",
      schema: undefined,
      timeout: undefined,
      scrapeOptions: {
        formats: ["markdown", "html"],
        onlyMainContent: true,
        includeTags: ["article", "main"],
        excludeTags: ["nav", "footer"],
        waitFor: 2000,
      },
    });
  });

  it("should return ExtractResult from client", async () => {
    const mockResult: ExtractResult = {
      success: true,
      data: [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ],
    };

    mockClient.extract.mockResolvedValue(mockResult);

    const options: ExtractOptions = {
      urls: ["https://example.com/users"],
      prompt: "Extract user data",
    };

    const result = await extractPipeline(mockClient, options);

    expect(result).toEqual(mockResult);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it("should handle errors appropriately", async () => {
    mockClient.extract.mockRejectedValue(new Error("Extraction failed"));

    const options: ExtractOptions = {
      urls: ["https://example.com"],
      prompt: "Extract data",
    };

    await expect(extractPipeline(mockClient, options)).rejects.toThrow(
      "Extraction failed",
    );
  });

  it("should not include scrapeOptions when not provided", async () => {
    mockClient.extract.mockResolvedValue({
      success: true,
      data: [{ test: "value" }],
    });

    const options: ExtractOptions = {
      urls: ["https://example.com"],
      prompt: "Extract test data",
    };

    await extractPipeline(mockClient, options);

    expect(mockClient.extract).toHaveBeenCalledWith({
      urls: ["https://example.com"],
      prompt: "Extract test data",
      schema: undefined,
      timeout: undefined,
    });
  });
});
