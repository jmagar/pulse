import { describe, it, expect } from "vitest";
import { formatExtractResponse } from "./response.js";
import type { ExtractResult } from "./pipeline.js";

describe("Extract Response Formatting", () => {
  it("should format successful extraction with data", () => {
    const result: ExtractResult = {
      success: true,
      data: [
        { name: "Item 1", value: 100 },
        { name: "Item 2", value: 200 },
      ],
    };

    const response = formatExtractResponse(result, [
      "https://example.com/page1",
    ]);

    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe("text");
    expect(response.content[0].text).toContain("Extracted Data from 1 URL(s)");
    expect(response.content[0].text).toContain("```json");
    expect(response.content[0].text).toContain('"name": "Item 1"');
    expect(response.content[0].text).toContain("**Extracted:** 2 items");
    expect(response.isError).toBeUndefined();
  });

  it("should show item count correctly", () => {
    const result: ExtractResult = {
      success: true,
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
    };

    const response = formatExtractResponse(result, [
      "https://example.com/page1",
      "https://example.com/page2",
    ]);

    expect(response.content[0].text).toContain("**Extracted:** 3 items");
  });

  it("should format JSON with indentation", () => {
    const result: ExtractResult = {
      success: true,
      data: [{ nested: { key: "value" } }],
    };

    const response = formatExtractResponse(result, ["https://example.com"]);

    // Check that JSON is formatted with indentation (2 spaces)
    expect(response.content[0].text).toContain('  "nested"');
    expect(response.content[0].text).toContain('    "key"');
  });

  it("should handle failure with error message", () => {
    const result: ExtractResult = {
      success: false,
      error: "API timeout",
    };

    const response = formatExtractResponse(result, ["https://example.com"]);

    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe("text");
    expect(response.content[0].text).toBe("Extract failed: API timeout");
    expect(response.isError).toBe(true);
  });

  it("should handle missing data", () => {
    const result: ExtractResult = {
      success: false,
    };

    const response = formatExtractResponse(result, ["https://example.com"]);

    expect(response.content[0].text).toBe("Extract failed: No data extracted");
    expect(response.isError).toBe(true);
  });

  it("should display correct URL count", () => {
    const result: ExtractResult = {
      success: true,
      data: [{ id: 1 }],
    };

    const responseOneUrl = formatExtractResponse(result, [
      "https://example.com/page1",
    ]);
    expect(responseOneUrl.content[0].text).toContain("from 1 URL(s)");

    const responseThreeUrls = formatExtractResponse(result, [
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page3",
    ]);
    expect(responseThreeUrls.content[0].text).toContain("from 3 URL(s)");
  });
});
