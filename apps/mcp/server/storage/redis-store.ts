import type { RedisClientType } from "redis";

import {
  deserializeRecord,
  serializeRecord,
  type TokenRecord,
  type TokenStore,
  type TokenRecordUpdate,
} from "./token-store.js";

export interface RedisTokenStoreOptions {
  ttlSeconds?: number;
}

type RedisClient = Pick<RedisClientType, "get" | "set" | "del" | "expire">;

const DEFAULT_TTL_SECONDS = 3600;

function buildKey(userId: string): string {
  return `oauth:token:${userId}`;
}

function computeTtl(record: TokenRecord, fallback: number): number {
  const delta = Math.floor((record.expiresAt.getTime() - Date.now()) / 1000);
  return delta > 0 ? delta : fallback;
}

export function createRedisTokenStore(
  client: RedisClient,
  options?: RedisTokenStoreOptions,
): TokenStore {
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  async function save(record: TokenRecord): Promise<void> {
    const key = buildKey(record.userId);
    await client.set(key, JSON.stringify(serializeRecord(record)));
    await client.expire(key, computeTtl(record, ttlSeconds));
  }

  async function get(userId: string): Promise<TokenRecord | null> {
    const key = buildKey(userId);
    const value = await client.get(key);
    if (!value) {
      return null;
    }
    return deserializeRecord(JSON.parse(value));
  }

  async function deleteRecord(userId: string): Promise<void> {
    const key = buildKey(userId);
    await client.del(key);
  }

  async function refresh(
    userId: string,
    updates: TokenRecordUpdate,
  ): Promise<TokenRecord | null> {
    const current = await get(userId);
    if (!current) {
      return null;
    }
    const next: TokenRecord = {
      ...current,
      ...updates,
      expiresAt: updates.expiresAt ?? current.expiresAt,
      scopes: updates.scopes ?? current.scopes,
      updatedAt: updates.updatedAt ?? new Date(),
    };
    await save(next);
    return next;
  }

  return {
    save,
    get,
    delete: deleteRecord,
    refresh,
  };
}
