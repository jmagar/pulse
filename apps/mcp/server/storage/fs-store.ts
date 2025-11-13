import { promises as fs } from "node:fs";
import path from "node:path";

import {
  deserializeRecord,
  serializeRecord,
  type TokenRecord,
  type TokenStore,
  type TokenRecordUpdate,
} from "./token-store.js";

export interface FilesystemTokenStoreOptions {
  basePath: string;
}

function encodeFileName(userId: string): string {
  return Buffer.from(userId).toString("hex");
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function recordPath(basePath: string, userId: string): string {
  return path.join(basePath, `${encodeFileName(userId)}.json`);
}

async function readRecord(
  filePath: string,
): Promise<TokenRecord | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(raw);
    return deserializeRecord(payload);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function createFilesystemTokenStore(
  options: FilesystemTokenStoreOptions,
): TokenStore {
  const { basePath } = options;

  async function save(record: TokenRecord): Promise<void> {
    await ensureDirectory(basePath);
    const filePath = recordPath(basePath, record.userId);
    const serialized = JSON.stringify(serializeRecord(record), null, 2);
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, serialized, "utf8");
    await fs.rename(tempPath, filePath);
  }

  async function get(userId: string): Promise<TokenRecord | null> {
    const filePath = recordPath(basePath, userId);
    return readRecord(filePath);
  }

  async function deleteRecord(userId: string): Promise<void> {
    const filePath = recordPath(basePath, userId);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async function refresh(
    userId: string,
    updates: TokenRecordUpdate,
  ): Promise<TokenRecord | null> {
    const existing = await get(userId);
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
    await save(updated);
    return updated;
  }

  return {
    save,
    get,
    delete: deleteRecord,
    refresh,
  };
}
