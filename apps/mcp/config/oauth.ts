import { z } from "zod";
import { env, parseBoolean, parseNumber } from "./environment.js";

const DEFAULT_SCOPES = ["openid", "email", "profile"] as const;
const DEFAULT_RESOURCE_INDICATOR = "https://pulse-mcp.local";
const DEFAULT_AUTHORIZATION_SERVER = "https://accounts.google.com";

export interface OAuthConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  sessionSecret: string;
  tokenEncryptionKey: string;
  resourceIndicator: string;
  authorizationServer: string;
  tokenTtlSeconds: number;
  refreshTtlSeconds: number;
}

const OAuthEnvSchema = z.object({
  enabled: z.boolean(),
  clientId: z.string().min(1, "clientId is required"),
  clientSecret: z.string().min(1, "clientSecret is required"),
  redirectUri: z.string().url("redirectUri must be a valid URL"),
  scopes: z.array(z.string().min(1)).min(1, "At least one scope is required"),
  sessionSecret: z
    .string()
    .min(32, "sessionSecret must be at least 32 characters"),
  tokenEncryptionKey: z
    .string()
    .min(32, "tokenEncryptionKey must be at least 32 characters"),
  resourceIndicator: z.string().url("resourceIndicator must be a valid URL"),
  authorizationServer: z
    .string()
    .url("authorizationServer must be a valid URL"),
  tokenTtlSeconds: z.number().int().positive(),
  refreshTtlSeconds: z.number().int().positive(),
});

let cachedConfig: OAuthConfig | null = null;

interface LoadOptions {
  forceReload?: boolean;
}

function parseScopes(rawScopes?: string): string[] {
  const scopes = rawScopes
    ?.split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  if (scopes && scopes.length > 0) {
    return scopes;
  }

  return [...DEFAULT_SCOPES];
}

function getNumber(value: string | undefined, fallback: number): number {
  return parseNumber(value, fallback);
}

export function loadOAuthConfig(options: LoadOptions = {}): OAuthConfig | null {
  const enabled = parseBoolean(env.enableOAuth);

  if (!enabled) {
    cachedConfig = null;
    return null;
  }

  if (cachedConfig && !options.forceReload) {
    return cachedConfig;
  }

  const parsed = OAuthEnvSchema.parse({
    enabled,
    clientId: env.googleClientId,
    clientSecret: env.googleClientSecret,
    redirectUri: env.googleRedirectUri,
    scopes: parseScopes(env.googleScopes),
    sessionSecret: env.oauthSessionSecret,
    tokenEncryptionKey: env.oauthTokenKey,
    resourceIndicator: env.oauthResourceIndicator ?? DEFAULT_RESOURCE_INDICATOR,
    authorizationServer:
      env.oauthAuthorizationServer ?? DEFAULT_AUTHORIZATION_SERVER,
    tokenTtlSeconds: getNumber(env.oauthTokenTtl, 3600),
    refreshTtlSeconds: getNumber(env.oauthRefreshTtl, 2592000),
  });

  cachedConfig = parsed;
  return parsed;
}
