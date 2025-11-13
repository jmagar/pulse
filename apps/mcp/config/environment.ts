/**
 * @fileoverview Centralized environment variable configuration with backward compatibility
 *
 * Supports both MCP_* (monorepo) and legacy variable names for seamless migration.
 * All environment variable access should go through this module to ensure consistency.
 *
 * @module shared/config/environment
 */

/**
 * Get an environment variable with fallback to legacy name
 *
 * @param primary - Primary variable name (typically MCP_* prefixed)
 * @param fallback - Legacy variable name for backward compatibility
 * @param defaultValue - Optional default value
 * @returns The resolved environment variable value
 */
function getEnvVar(
  primary: string,
  fallback?: string,
  defaultValue?: string,
): string | undefined {
  const value = process.env[primary];
  if (value !== undefined) {
    return value;
  }

  if (fallback !== undefined) {
    const fallbackValue = process.env[fallback];
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
  }

  return defaultValue;
}

/**
 * Centralized environment configuration
 *
 * Provides a single source of truth for all environment variables used by the MCP server.
 * Supports both namespaced (MCP_*) and legacy variable names for backward compatibility.
 */
type EnvConfig = {
  port: string | undefined;
  nodeEnv: string | undefined;
  debug: string | undefined;
  logFormat: string | undefined;
  allowedOrigins: string | undefined;
  allowedHosts: string | undefined;
  enableOAuth: string | undefined;
  enableResumability: string | undefined;
  metricsAuthEnabled: string | undefined;
  metricsAuthKey: string | undefined;
  firecrawlApiKey: string | undefined;
  firecrawlBaseUrl: string | undefined;
  optimizeFor: string | undefined;
  llmProvider: string | undefined;
  llmApiKey: string | undefined;
  llmApiBaseUrl: string | undefined;
  llmModel: string | undefined;
  resourceStorage: string | undefined;
  resourceFilesystemRoot: string | undefined;
  resourceTtl: string | undefined;
  strategyConfigPath: string | undefined;
  mapDefaultCountry: string | undefined;
  mapDefaultLanguages: string | undefined;
  mapMaxResultsPerPage: string | undefined;
  skipHealthChecks: string | undefined;
  forceColor: string | undefined;
  noColor: string | undefined;
  webhookBaseUrl: string | undefined;
  webhookApiSecret: string | undefined;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  googleRedirectUri: string | undefined;
  googleScopes: string | undefined;
  oauthSessionSecret: string | undefined;
  oauthTokenKey: string | undefined;
  oauthResourceIndicator: string | undefined;
  oauthAuthorizationServer: string | undefined;
  oauthTokenTtl: string | undefined;
  oauthRefreshTtl: string | undefined;
  redisUrl: string | undefined;
  databaseUrl: string | undefined;
  webhookEvents: string | undefined;
};

function buildEnv(): EnvConfig {
  const nuqDatabaseUrl = getEnvVar("NUQ_DATABASE_URL");

  return {
    // Server Configuration
    port: getEnvVar("MCP_PORT", "PORT", "3060"),
    nodeEnv: getEnvVar("NODE_ENV", undefined, "development"),
    debug: getEnvVar("MCP_DEBUG", "DEBUG", "false"),
    logFormat: getEnvVar("MCP_LOG_FORMAT", "LOG_FORMAT", "text"),

    // HTTP Configuration
    allowedOrigins: getEnvVar("MCP_ALLOWED_ORIGINS", "ALLOWED_ORIGINS"),
    allowedHosts: getEnvVar("MCP_ALLOWED_HOSTS", "ALLOWED_HOSTS"),
    enableOAuth: getEnvVar("MCP_ENABLE_OAUTH", "ENABLE_OAUTH", "false"),
    enableResumability: getEnvVar(
      "MCP_ENABLE_RESUMABILITY",
      "ENABLE_RESUMABILITY",
      "false",
    ),

    // Metrics Configuration
    metricsAuthEnabled: getEnvVar(
      "MCP_METRICS_AUTH_ENABLED",
      "METRICS_AUTH_ENABLED",
      "false",
    ),
    metricsAuthKey: getEnvVar("MCP_METRICS_AUTH_KEY", "METRICS_AUTH_KEY"),

    // Firecrawl Integration
    firecrawlApiKey: getEnvVar("MCP_FIRECRAWL_API_KEY", "FIRECRAWL_API_KEY"),
    firecrawlBaseUrl: getEnvVar("MCP_FIRECRAWL_BASE_URL", "FIRECRAWL_BASE_URL"),
    optimizeFor: getEnvVar("MCP_OPTIMIZE_FOR", "OPTIMIZE_FOR", "cost"),

    // LLM Provider Configuration
    llmProvider: getEnvVar("MCP_LLM_PROVIDER", "LLM_PROVIDER"),
    llmApiKey: getEnvVar("MCP_LLM_API_KEY", "LLM_API_KEY"),
    llmApiBaseUrl: getEnvVar("MCP_LLM_API_BASE_URL", "LLM_API_BASE_URL"),
    llmModel: getEnvVar("MCP_LLM_MODEL", "LLM_MODEL"),

    // Storage Configuration
    resourceStorage: getEnvVar("MCP_RESOURCE_STORAGE", undefined, "memory"),
    resourceFilesystemRoot: getEnvVar("MCP_RESOURCE_FILESYSTEM_ROOT"),
    resourceTtl: getEnvVar("MCP_RESOURCE_TTL"),

    // Strategy Configuration
    strategyConfigPath: getEnvVar(
      "MCP_STRATEGY_CONFIG_PATH",
      "STRATEGY_CONFIG_PATH",
    ),

    // Map Tool Configuration
    mapDefaultCountry: getEnvVar(
      "MCP_MAP_DEFAULT_COUNTRY",
      "MAP_DEFAULT_COUNTRY",
    ),
    mapDefaultLanguages: getEnvVar(
      "MCP_MAP_DEFAULT_LANGUAGES",
      "MAP_DEFAULT_LANGUAGES",
    ),
    mapMaxResultsPerPage: getEnvVar(
      "MCP_MAP_MAX_RESULTS_PER_PAGE",
      "MAP_MAX_RESULTS_PER_PAGE",
    ),

    // Health Checks
    skipHealthChecks: getEnvVar(
      "MCP_SKIP_HEALTH_CHECKS",
      "SKIP_HEALTH_CHECKS",
      "false",
    ),

    // Color Output Control (for CLI tools)
    forceColor: getEnvVar("FORCE_COLOR"),
    noColor: getEnvVar("NO_COLOR"),

    // Webhook Query Tool Configuration
    webhookBaseUrl: getEnvVar(
      "MCP_WEBHOOK_BASE_URL",
      "WEBHOOK_BASE_URL",
      "http://pulse_webhook:52100",
    ),
    webhookApiSecret: getEnvVar(
      "MCP_WEBHOOK_API_SECRET",
      "WEBHOOK_API_SECRET",
    ),
    googleClientId: getEnvVar(
      "MCP_GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_ID",
    ),
    googleClientSecret: getEnvVar(
      "MCP_GOOGLE_CLIENT_SECRET",
      "GOOGLE_CLIENT_SECRET",
    ),
    googleRedirectUri: getEnvVar(
      "MCP_GOOGLE_REDIRECT_URI",
      "GOOGLE_REDIRECT_URI",
    ),
    googleScopes: getEnvVar(
      "MCP_GOOGLE_OAUTH_SCOPES",
      "GOOGLE_OAUTH_SCOPES",
      "openid,email,profile",
    ),
    oauthSessionSecret: getEnvVar(
      "MCP_OAUTH_SESSION_SECRET",
      "OAUTH_SESSION_SECRET",
    ),
    oauthTokenKey: getEnvVar(
      "MCP_OAUTH_TOKEN_KEY",
      "OAUTH_TOKEN_KEY",
    ),
    oauthResourceIndicator: getEnvVar(
      "MCP_OAUTH_RESOURCE_IDENTIFIER",
      "MCP_RESOURCE_IDENTIFIER",
    ),
    oauthAuthorizationServer: getEnvVar(
      "MCP_OAUTH_AUTHORIZATION_SERVER",
      "OAUTH_AUTHORIZATION_SERVER",
      "https://accounts.google.com",
    ),
    oauthTokenTtl: getEnvVar(
      "MCP_OAUTH_TOKEN_TTL",
      "OAUTH_TOKEN_TTL",
      "3600",
    ),
    oauthRefreshTtl: getEnvVar(
      "MCP_OAUTH_REFRESH_TTL",
      "OAUTH_REFRESH_TTL",
      "2592000",
    ),
    redisUrl: getEnvVar("MCP_REDIS_URL", "REDIS_URL"),
    databaseUrl: getEnvVar(
      "MCP_DATABASE_URL",
      "DATABASE_URL",
      nuqDatabaseUrl,
    ),
    webhookEvents: getEnvVar(
      "MCP_WEBHOOK_EVENTS",
      "WEBHOOK_EVENTS",
      "page",
    ),
  };
}

export const env = buildEnv();

export function getEnvSnapshot(): EnvConfig {
  return buildEnv();
}

/**
 * Type-safe boolean conversion helper
 *
 * @param value - String value to convert
 * @returns Boolean value
 */
export function parseBoolean(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  return value === "true" || value === "1";
}

/**
 * Type-safe number conversion helper
 *
 * @param value - String value to convert
 * @param defaultValue - Default value if parsing fails
 * @returns Number value
 */
export function parseNumber(
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Type-safe array conversion helper
 *
 * @param value - Comma-separated string value to convert
 * @returns Array of strings
 */
export function parseArray(value: string | undefined): string[] {
  if (value === undefined || value === "") {
    return [];
  }
  return value.split(",").map((s) => s.trim()).filter((s) => s !== "");
}

/**
 * Get all environment variable names used by this application
 *
 * Useful for debugging and documentation purposes.
 *
 * @returns Object mapping variable names to their values (with sensitive values masked)
 */
export function getAllEnvVars(): Record<string, string | undefined> {
  const vars: Record<string, string | undefined> = {};

  // Add all variables referenced in env object
  const varNames = [
    "MCP_PORT",
    "PORT",
    "NODE_ENV",
    "MCP_DEBUG",
    "DEBUG",
    "MCP_LOG_FORMAT",
    "LOG_FORMAT",
    "MCP_ALLOWED_ORIGINS",
    "ALLOWED_ORIGINS",
    "MCP_ALLOWED_HOSTS",
    "ALLOWED_HOSTS",
    "MCP_ENABLE_OAUTH",
    "ENABLE_OAUTH",
    "MCP_ENABLE_RESUMABILITY",
    "ENABLE_RESUMABILITY",
    "MCP_METRICS_AUTH_ENABLED",
    "METRICS_AUTH_ENABLED",
    "MCP_METRICS_AUTH_KEY",
    "METRICS_AUTH_KEY",
    "MCP_FIRECRAWL_API_KEY",
    "FIRECRAWL_API_KEY",
    "MCP_FIRECRAWL_BASE_URL",
    "FIRECRAWL_BASE_URL",
    "MCP_OPTIMIZE_FOR",
    "OPTIMIZE_FOR",
    "MCP_LLM_PROVIDER",
    "LLM_PROVIDER",
    "MCP_LLM_API_KEY",
    "LLM_API_KEY",
    "MCP_LLM_API_BASE_URL",
    "LLM_API_BASE_URL",
    "MCP_LLM_MODEL",
    "LLM_MODEL",
    "MCP_RESOURCE_STORAGE",
    "MCP_RESOURCE_FILESYSTEM_ROOT",
    "MCP_RESOURCE_TTL",
    "MCP_STRATEGY_CONFIG_PATH",
    "STRATEGY_CONFIG_PATH",
    "MCP_MAP_DEFAULT_COUNTRY",
    "MAP_DEFAULT_COUNTRY",
    "MCP_MAP_DEFAULT_LANGUAGES",
    "MAP_DEFAULT_LANGUAGES",
    "MCP_MAP_MAX_RESULTS_PER_PAGE",
    "MAP_MAX_RESULTS_PER_PAGE",
    "MCP_SKIP_HEALTH_CHECKS",
    "SKIP_HEALTH_CHECKS",
    "FORCE_COLOR",
    "NO_COLOR",
    "MCP_WEBHOOK_BASE_URL",
    "WEBHOOK_BASE_URL",
    "MCP_WEBHOOK_API_SECRET",
    "WEBHOOK_API_SECRET",
    "MCP_GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_ID",
    "MCP_GOOGLE_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "MCP_GOOGLE_REDIRECT_URI",
    "GOOGLE_REDIRECT_URI",
    "MCP_GOOGLE_OAUTH_SCOPES",
    "GOOGLE_OAUTH_SCOPES",
    "MCP_OAUTH_SESSION_SECRET",
    "OAUTH_SESSION_SECRET",
    "MCP_OAUTH_TOKEN_KEY",
    "OAUTH_TOKEN_KEY",
    "MCP_OAUTH_RESOURCE_IDENTIFIER",
    "MCP_RESOURCE_IDENTIFIER",
    "MCP_OAUTH_AUTHORIZATION_SERVER",
    "OAUTH_AUTHORIZATION_SERVER",
    "MCP_OAUTH_TOKEN_TTL",
    "OAUTH_TOKEN_TTL",
    "MCP_OAUTH_REFRESH_TTL",
    "OAUTH_REFRESH_TTL",
    "MCP_REDIS_URL",
    "REDIS_URL",
    "MCP_DATABASE_URL",
    "DATABASE_URL",
    "NUQ_DATABASE_URL",
    "MCP_WEBHOOK_EVENTS",
    "WEBHOOK_EVENTS",
  ];

  const sensitiveVars = [
    "MCP_FIRECRAWL_API_KEY",
    "FIRECRAWL_API_KEY",
    "MCP_LLM_API_KEY",
    "LLM_API_KEY",
    "MCP_METRICS_AUTH_KEY",
    "METRICS_AUTH_KEY",
    "MCP_WEBHOOK_API_SECRET",
    "WEBHOOK_API_SECRET",
    "MCP_GOOGLE_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "MCP_OAUTH_SESSION_SECRET",
    "OAUTH_SESSION_SECRET",
    "MCP_OAUTH_TOKEN_KEY",
    "OAUTH_TOKEN_KEY",
  ];

  for (const varName of varNames) {
    const value = process.env[varName];
    if (value !== undefined) {
      // Mask sensitive values
      vars[varName] = sensitiveVars.includes(varName)
        ? "***REDACTED***"
        : value;
    }
  }

  return vars;
}
