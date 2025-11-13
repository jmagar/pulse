/**
 * @fileoverview Service health check implementations
 *
 * Provides health check functions for external services (Firecrawl API)
 * to validate configuration and connectivity at startup.
 *
 * @module shared/config/health-checks
 */

import https from "https";
import http from "http";
import { createClient } from "redis";
import { env } from "./environment.js";
import { SELF_HOSTED_NO_AUTH } from "@firecrawl/client";
import { loadOAuthConfig } from "./oauth.js";

/**
 * Result of a service health check
 *
 * Contains success status and optional error message for diagnostics.
 */
export interface HealthCheckResult {
  service: string;
  success: boolean;
  error?: string;
}

function resolveProtocol(portOrProtocol: string): typeof https | typeof http {
  return portOrProtocol === "https:" ? https : http;
}

/**
 * Performs a minimal health check for Firecrawl API
 * Tests authentication without consuming credits
 */
async function checkFirecrawlAuth(
  apiKey: string,
  baseUrl: string,
): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    // Skip health check for self-hosted instances
    if (apiKey === SELF_HOSTED_NO_AUTH) {
      resolve({
        service: "Firecrawl",
        success: true,
      });
      return;
    }

    // Parse the base URL to extract hostname, port, and protocol
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch (_error) {
      resolve({
        service: "Firecrawl",
        success: false,
        error: `Invalid base URL: ${baseUrl}`,
      });
      return;
    }

    const protocol = resolveProtocol(parsedUrl.protocol);
    const port = parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80);

    const options = {
      hostname: parsedUrl.hostname,
      port: parseInt(port.toString()),
      path: "/v2/scrape",
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    };

    const req = protocol.request(options, (res: http.IncomingMessage) => {
      // We expect 400 for missing URL parameter, but 401 indicates auth failure
      if (res.statusCode === 401) {
        resolve({
          service: "Firecrawl",
          success: false,
          error: "Invalid API key - authentication failed",
        });
      } else if (res.statusCode === 400) {
        // 400 means auth passed but request was invalid (expected without URL)
        resolve({
          service: "Firecrawl",
          success: true,
        });
      } else {
        resolve({
          service: "Firecrawl",
          success: false,
          error: `Unexpected response: ${res.statusCode}`,
        });
      }
    });

    req.on("error", (error: Error) => {
      resolve({
        service: "Firecrawl",
        success: false,
        error: `Connection error: ${error.message}`,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        service: "Firecrawl",
        success: false,
        error: "Request timeout",
      });
    });

    req.setTimeout(5000);
    req.write(JSON.stringify({})); // Empty body to trigger 400 instead of consuming credits
    req.end();
  });
}

/**
 * Run health checks for all configured services
 */
export async function runHealthChecks(): Promise<HealthCheckResult[]> {
  const checks: Promise<HealthCheckResult>[] = [];

  if (env.firecrawlApiKey) {
    const baseUrl = env.firecrawlBaseUrl || "https://api.firecrawl.dev";
    checks.push(checkFirecrawlAuth(env.firecrawlApiKey, baseUrl));
  }

  if (env.enableOAuth === "true") {
    checks.push(checkOAuthConfig());
    checks.push(checkRedisSession());
  }

  if (checks.length === 0) {
    return [];
  }

  return Promise.all(checks);
}

function checkOAuthConfig(): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    try {
      const config = loadOAuthConfig();
      if (!config) {
        resolve({
          service: "OAuth",
          success: false,
          error: "OAuth configuration missing",
        });
        return;
      }
      resolve({ service: "OAuth", success: true });
    } catch (error) {
      resolve({
        service: "OAuth",
        success: false,
        error: (error as Error).message,
      });
    }
  });
}

async function checkRedisSession(): Promise<HealthCheckResult> {
  if (!env.redisUrl) {
    return {
      service: "Redis (sessions)",
      success: false,
      error: "MCP_REDIS_URL is not configured",
    };
  }

  const client = createClient({ url: env.redisUrl });
  client.on("error", () => {});

  try {
    await client.connect();
    await client.ping();
    return {
      service: "Redis (sessions)",
      success: true,
    };
  } catch (error) {
    return {
      service: "Redis (sessions)",
      success: false,
      error: (error as Error).message,
    };
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}
