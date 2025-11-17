import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getEnvironmentVariables,
  formatEnvironmentVariables,
} from "./env-display.js";

describe("Environment Variable Display", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Set minimal environment
    process.env.PORT = "3060";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getEnvironmentVariables()", () => {
    it("should include server configuration", () => {
      // RED: This will fail because getEnvironmentVariables() doesn't exist
      const vars = getEnvironmentVariables();

      const serverVars = vars.filter((v) => v.category === "Server");
      expect(serverVars.length).toBeGreaterThan(0);
      expect(serverVars.some((v) => v.name === "PORT")).toBe(true);
      expect(serverVars.some((v) => v.name === "NODE_ENV")).toBe(true);
    });

    it("should include HTTP configuration when set", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
      process.env.ENABLE_OAUTH = "true";

      const vars = getEnvironmentVariables();
      const httpVars = vars.filter((v) => v.category === "HTTP");

      expect(httpVars.some((v) => v.name === "ALLOWED_ORIGINS")).toBe(true);
      expect(httpVars.some((v) => v.name === "ENABLE_OAUTH")).toBe(true);
    });

    it("should mark API keys as sensitive", () => {
      process.env.FIRECRAWL_API_KEY = "sk-test123";

      const vars = getEnvironmentVariables();
      const apiKeyVar = vars.find((v) => v.name === "FIRECRAWL_API_KEY");

      expect(apiKeyVar?.sensitive).toBe(true);
    });

    it("should not mark URLs as sensitive", () => {
      process.env.FIRECRAWL_BASE_URL = "https://api.test";

      const vars = getEnvironmentVariables();
      const urlVar = vars.find((v) => v.name === "FIRECRAWL_BASE_URL");

      expect(urlVar?.sensitive).toBe(false);
    });

    it("should include LLM configuration when set", () => {
      process.env.LLM_PROVIDER = "anthropic";
      process.env.LLM_API_KEY = "sk-ant-test";
      process.env.LLM_MODEL = "claude-sonnet-4";

      const vars = getEnvironmentVariables();
      const llmVars = vars.filter((v) => v.category === "LLM");

      expect(llmVars).toHaveLength(3);
      expect(llmVars.some((v) => v.name === "LLM_PROVIDER")).toBe(true);
    });

    it("should include storage configuration", () => {
      process.env.MCP_RESOURCE_STORAGE = "filesystem";

      const vars = getEnvironmentVariables();
      const storageVars = vars.filter((v) => v.category === "Storage");

      expect(storageVars.some((v) => v.name === "MCP_RESOURCE_STORAGE")).toBe(
        true,
      );
    });
  });

  describe("formatEnvironmentVariables()", () => {
    it("should return formatted lines grouped by category", () => {
      // RED: This will fail because formatEnvironmentVariables() doesn't exist
      const lines = formatEnvironmentVariables();

      expect(lines.length).toBeGreaterThan(0);
      expect(lines.some((l) => l.includes("Server:"))).toBe(true);
    });

    it("should mask sensitive values", () => {
      process.env.FIRECRAWL_API_KEY = "sk-1234567890abcdef";

      const lines = formatEnvironmentVariables();
      const apiKeyLine = lines.find((l) => l.includes("FIRECRAWL_API_KEY"));

      expect(apiKeyLine).toBeDefined();
      expect(apiKeyLine).not.toContain("sk-1234567890abcdef");
      expect(apiKeyLine).toContain("*");
    });

    it("should not mask non-sensitive values", () => {
      process.env.PORT = "3060";

      const lines = formatEnvironmentVariables();
      const portLine = lines.find((l) => l.includes("PORT"));

      expect(portLine).toContain("3060");
      expect(portLine).not.toContain("*");
    });

    it("should separate categories with blank lines", () => {
      process.env.FIRECRAWL_API_KEY = "test";
      process.env.LLM_PROVIDER = "anthropic";
      process.env.LLM_API_KEY = "test";

      const lines = formatEnvironmentVariables();

      // Should have blank lines between categories
      const blankLines = lines.filter((l) => l === "");
      expect(blankLines.length).toBeGreaterThan(0);
    });
  });
});
