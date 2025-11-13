import path from "node:path";

import { Pool } from "pg";
import { createClient } from "redis";

import { env } from "../../config/environment.js";
import { createFilesystemTokenStore } from "./fs-store.js";
import { createPostgresTokenStore } from "./postgres-store.js";
import { createRedisTokenStore } from "./redis-store.js";
import type { TokenStore } from "./token-store.js";

let cachedStore: TokenStore | null = null;

function getFilesystemPath(): string {
  return path.resolve(process.cwd(), ".cache", "oauth-tokens");
}

export async function createTokenStore(): Promise<TokenStore> {
  if (cachedStore) {
    return cachedStore;
  }

  if (env.databaseUrl) {
    const pool = new Pool({ connectionString: env.databaseUrl });
    cachedStore = createPostgresTokenStore(pool);
    return cachedStore;
  }

  if (env.redisUrl) {
    const client = createClient({ url: env.redisUrl });
    await client.connect();
    cachedStore = createRedisTokenStore(client);
    return cachedStore;
  }

  const basePath = getFilesystemPath();
  cachedStore = createFilesystemTokenStore({ basePath });
  return cachedStore;
}
