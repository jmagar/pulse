import { describe, it, expect, beforeAll } from "vitest";
import { createProfileTool } from "./index.js";

/**
 * Integration tests for profile_crawl tool
 *
 * These tests require:
 * - Webhook service running at WEBHOOK_BASE_URL
 * - Valid WEBHOOK_API_SECRET
 * - Test crawl session in database
 *
 * Skip if environment not configured:
 * npm test -- --run --testNamePattern="^((?!integration).)*$"
 */

const WEBHOOK_BASE_URL =
  process.env.WEBHOOK_BASE_URL || "http://localhost:52100";
const WEBHOOK_API_SECRET = process.env.WEBHOOK_API_SECRET || "";
const SKIP_INTEGRATION =
  !WEBHOOK_API_SECRET || WEBHOOK_BASE_URL.includes("localhost");

describe.skipIf(SKIP_INTEGRATION)("ProfileTool Integration", () => {
  let tool: ReturnType<typeof createProfileTool>;

  beforeAll(() => {
    tool = createProfileTool({
      baseUrl: WEBHOOK_BASE_URL,
      apiSecret: WEBHOOK_API_SECRET,
    });
  });

  it("should handle unknown crawl_id gracefully", async () => {
    if (!tool.handler || typeof tool.handler !== "function") {
      throw new Error("Tool handler not defined");
    }
    const result = await tool.handler({
      crawl_id: "nonexistent-crawl-id-12345",
    });

    expect(result.isError).toBe(true);
    // Accept either network error or proper 404 response
    const errorText = result.content[0].text;
    const validErrors = [
      errorText.includes("Crawl not found"),
      errorText.includes("fetch failed"),
      errorText.includes("ECONNREFUSED"),
      errorText.includes("connection"),
    ];
    expect(validErrors.some(Boolean)).toBe(true);
  });

  // Note: Real crawl tests would require creating test data in database
  // or using a known test crawl_id. Example:
  //
  // it("should fetch real crawl metrics", async () => {
  //   const result = await tool.handler({
  //     crawl_id: "real-test-crawl-id",
  //   });
  //
  //   expect(result.isError).toBeUndefined();
  //   expect(result.content[0].text).toContain("Crawl Performance Profile");
  // });
});
