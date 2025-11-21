import { describe, expect, it, vi } from "vitest";
import { createQueryTool } from "../../../tools/query/index.js";

describe("Query Tool handler logging", () => {
  it("logs start and completion", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        total: 0,
        query: "test",
        mode: "hybrid",
        offset: 0,
      }),
    }) as any;

    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test",
    });
    await tool.handler({ query: "test", mode: "hybrid" });

    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Query execution started"),
      expect.objectContaining({
        query: "test",
        mode: "hybrid",
        limit: 10,
        offset: 0,
      }),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Query execution completed"),
      expect.objectContaining({
        query: "test",
        results: 0,
        total: 0,
        duration_ms: expect.any(Number),
      }),
    );
    expect(consoleError).not.toHaveBeenCalled();

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });
});
