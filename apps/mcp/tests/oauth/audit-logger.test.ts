import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(() => ({ query: mockQuery })),
}));

describe("audit logger", () => {
  beforeEach(() => {
    vi.resetModules();
    mockQuery.mockReset();
  });

  it("skips logging when database URL missing", async () => {
    delete process.env.MCP_DATABASE_URL;
    const { logAuditEvent } = await import(
      "../../server/oauth/audit-logger.js"
    );
    await logAuditEvent({ type: "login_success", userId: "user" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("writes log entry when configured", async () => {
    process.env.MCP_DATABASE_URL = "postgres://example";
    const { logAuditEvent } = await import(
      "../../server/oauth/audit-logger.js"
    );
    await logAuditEvent({ type: "login_success", userId: "user" });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const args = mockQuery.mock.calls[0];
    expect(args[1][0]).toBe("user");
  });
});
