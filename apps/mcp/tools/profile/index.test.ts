import { describe, it, expect } from "vitest";
import { createProfileTool } from "./index.js";

describe("createProfileTool", () => {
  it("should create tool with correct name", () => {
    const tool = createProfileTool({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });

    expect(tool.name).toBe("profile_crawl");
  });

  it("should have description", () => {
    const tool = createProfileTool({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });

    expect(tool.description).toBeTruthy();
    expect(tool.description).toContain("debug");
    expect(tool.description).toContain("performance");
  });

  it("should have input schema", () => {
    const tool = createProfileTool({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });

    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.required).toContain("crawl_id");
  });

  it("should have handler function", () => {
    const tool = createProfileTool({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });

    expect(tool.handler).toBeDefined();
    expect(typeof tool.handler).toBe("function");
  });
});
