import { describe, expect, it } from "vitest";

import { createTokenManager } from "../../server/oauth/token-manager.js";
import type {
  TokenRecord,
  TokenRecordUpdate,
  TokenStore,
} from "../../server/storage/token-store.js";

function buildRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  const now = new Date();
  return {
    userId: "user-123",
    sessionId: "session-abc",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    expiresAt: new Date(now.getTime() + 3600_000),
    scopes: ["openid"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class MemoryStore implements TokenStore {
  public records = new Map<string, TokenRecord>();

  async save(record: TokenRecord): Promise<void> {
    this.records.set(record.userId, record);
  }

  async get(userId: string): Promise<TokenRecord | null> {
    return this.records.get(userId) ?? null;
  }

  async delete(userId: string): Promise<void> {
    this.records.delete(userId);
  }

  async refresh(
    userId: string,
    updates: TokenRecordUpdate,
  ): Promise<TokenRecord | null> {
    const existing = await this.get(userId);
    if (!existing) {
      return null;
    }
    const updated: TokenRecord = {
      ...existing,
      ...updates,
      expiresAt: updates.expiresAt ?? existing.expiresAt,
      scopes: updates.scopes ?? existing.scopes,
      updatedAt: updates.updatedAt ?? new Date(),
    };
    await this.save(updated);
    return updated;
  }
}

describe("Token Manager", () => {
  const encryptionKey = "k".repeat(64);

  it("encrypts tokens before persisting", async () => {
    const store = new MemoryStore();
    const manager = createTokenManager({ store, encryptionKey });
    const record = buildRecord();

    await manager.save(record);

    const stored = store.records.get("user-123");
    expect(stored?.accessToken).toMatch(/^enc:/);
  });

  it("decrypts tokens on retrieval", async () => {
    const store = new MemoryStore();
    const manager = createTokenManager({ store, encryptionKey });
    const record = buildRecord();
    await manager.save(record);

    const loaded = await manager.get("user-123");
    expect(loaded?.accessToken).toBe("access-token");
    expect(loaded?.refreshToken).toBe("refresh-token");
  });

  it("refreshes access tokens using update pipeline", async () => {
    const store = new MemoryStore();
    const manager = createTokenManager({ store, encryptionKey });
    const record = buildRecord();
    await manager.save(record);

    const refreshed = await manager.refresh("user-123", {
      accessToken: "new-access",
      expiresAt: new Date(Date.now() + 7200_000),
    });

    expect(refreshed?.accessToken).toBe("new-access");
    expect(refreshed?.expiresAt.getTime()).toBeGreaterThan(record.expiresAt.getTime());

    const stored = store.records.get("user-123");
    expect(stored?.accessToken).toMatch(/^enc:/);
  });
});
