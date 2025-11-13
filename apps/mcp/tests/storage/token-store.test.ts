import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TokenRecord } from "../../server/storage/token-store.js";

import { createFilesystemTokenStore } from "../../server/storage/fs-store.js";
import { createRedisTokenStore } from "../../server/storage/redis-store.js";
import { createPostgresTokenStore } from "../../server/storage/postgres-store.js";

class InMemoryRedisClient {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async connect(): Promise<void> {}

  async quit(): Promise<void> {
    this.store.clear();
  }

  async get(key: string): Promise<string | null> {
    const record = this.store.get(key);
    if (!record) {
      return null;
    }
    if (record.expiresAt && record.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return record.value;
  }

  async set(key: string, value: string): Promise<string> {
    this.store.set(key, { value });
    return "OK";
  }

  async expire(key: string, seconds: number): Promise<number> {
    const record = this.store.get(key);
    if (!record) {
      return 0;
    }
    record.expiresAt = Date.now() + seconds * 1000;
    this.store.set(key, record);
    return 1;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }
}

function buildTokenRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  const now = new Date();
  return {
    userId: "user-123",
    sessionId: "session-abc",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    expiresAt: new Date(now.getTime() + 3600_000),
    scopes: ["openid", "email"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Filesystem token store", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "token-store-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists and retrieves token records", async () => {
    const store = createFilesystemTokenStore({ basePath: tempDir });
    const record = buildTokenRecord();
    await store.save(record);

    const loaded = await store.get(record.userId);
    expect(loaded).toEqual(record);
  });

  it("deletes stored records", async () => {
    const store = createFilesystemTokenStore({ basePath: tempDir });
    const record = buildTokenRecord();
    await store.save(record);
    await store.delete(record.userId);

    const loaded = await store.get(record.userId);
    expect(loaded).toBeNull();
  });
});

describe("Redis token store", () => {
  it("stores and retrieves tokens", async () => {
    const client = new InMemoryRedisClient();
    const store = createRedisTokenStore(client, { ttlSeconds: 60 });
    const record = buildTokenRecord({ userId: "redis-user" });
    await store.save(record);

    const loaded = await store.get("redis-user");
    expect(loaded?.accessToken).toBe("access-token");
  });

  it("refreshes token data", async () => {
    const client = new InMemoryRedisClient();
    const store = createRedisTokenStore(client, { ttlSeconds: 60 });
    const record = buildTokenRecord({ userId: "refresh-user" });
    await store.save(record);

    const updated = await store.refresh("refresh-user", {
      accessToken: "new-access",
      updatedAt: new Date(),
    });

    expect(updated?.accessToken).toBe("new-access");
    const loaded = await store.get("refresh-user");
    expect(loaded?.accessToken).toBe("new-access");
  });
});

describe("Postgres token store", () => {
  const mockQuery = vi.fn();
  const pool = { query: mockQuery } as any;
  const store = createPostgresTokenStore(pool);
  const record = buildTokenRecord({ userId: "pg-user" });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("upserts token records", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await store.save(record);
    expect(mockQuery).toHaveBeenCalled();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO oauth_tokens/i);
    expect(params).toContain("pg-user");
  });

  it("retrieves token records", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          user_id: "pg-user",
          session_id: "session-abc",
          access_token: "token",
          refresh_token: "refresh",
          token_type: "Bearer",
          expires_at: new Date().toISOString(),
          scopes: ["openid"],
          id_token: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      rowCount: 1,
    });

    const loaded = await store.get("pg-user");
    expect(loaded?.userId).toBe("pg-user");
  });

  it("deletes token records", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await store.delete("pg-user");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM oauth_tokens/i),
      ["pg-user"],
    );
  });
});
