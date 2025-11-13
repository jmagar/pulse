import type { Application, RequestHandler } from "express";
import session from "express-session";
import RedisStore from "connect-redis";
import { createClient } from "redis";

import { env, parseNumber } from "../../config/environment.js";
import { logError, logInfo } from "../../utils/logging.js";

const SESSION_COOKIE_NAME = "pulse.sid";
const SESSION_PREFIX = "pulse:sess:";

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;

async function getRedisClient(): Promise<RedisClient> {
  if (redisClient) {
    return redisClient;
  }

  if (!env.redisUrl) {
    throw new Error(
      "MCP_REDIS_URL (or REDIS_URL) is required for OAuth sessions",
    );
  }

  const client = createClient({ url: env.redisUrl });
  client.on("error", (error: Error) => {
    logError("session.redis", error);
  });
  client.on("connect", () => {
    logInfo("session.redis", "Connected to Redis session store");
  });

  await client.connect();
  redisClient = client;
  return client;
}

export interface SessionMiddlewareOptions {
  store?: session.Store;
  cookieName?: string;
  rolling?: boolean;
}

function resolveSecret(): string {
  if (env.oauthSessionSecret) {
    return env.oauthSessionSecret;
  }
  throw new Error("MCP_OAUTH_SESSION_SECRET is required when OAuth is enabled");
}

function resolveMaxAge(): number {
  const fallback = 2592000; // 30 days
  const ttl = parseNumber(env.oauthRefreshTtl, fallback);
  return ttl * 1000;
}

export function createSessionMiddleware(
  options: SessionMiddlewareOptions = {},
): RequestHandler {
  const secret = resolveSecret();
  const cookieName = options.cookieName ?? SESSION_COOKIE_NAME;
  const rolling = options.rolling ?? true;

  return session({
    name: cookieName,
    secret,
    resave: false,
    saveUninitialized: false,
    rolling,
    store: options.store,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.nodeEnv === "production",
      maxAge: resolveMaxAge(),
    },
  });
}

export async function attachRedisSession(app: Application): Promise<void> {
  const client = await getRedisClient();
  const store = new RedisStore({ client, prefix: SESSION_PREFIX });
  app.use(createSessionMiddleware({ store }));
}
