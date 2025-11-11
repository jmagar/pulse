/**
 * Environment variable display utilities for server startup logging
 *
 * Provides functions to collect and format environment variables with
 * proper masking of sensitive values (API keys) and categorization.
 */

import { getEnvSnapshot } from "../../config/environment.js";
import { colorHelpers, maskSensitiveValue } from "../../utils/logging.js";

/**
 * Represents an environment variable for display purposes
 */
export interface EnvVarDisplay {
  /** The environment variable name */
  name: string;
  /** The environment variable value */
  value: string;
  /** Whether the value should be masked in output */
  sensitive: boolean;
  /** Display category for grouping related variables */
  category: string;
}

/**
 * Collect all relevant environment variables for display
 *
 * Gathers server configuration, HTTP settings, scraping service configuration,
 * LLM provider settings, and storage configuration. Marks sensitive values
 * (API keys) for masking in output.
 *
 * @returns Array of environment variables with display metadata
 */
export function getEnvironmentVariables(): EnvVarDisplay[] {
  const env = getEnvSnapshot();
  const vars: EnvVarDisplay[] = [];

  // Server configuration - always shown with defaults
  vars.push(
    {
      name: "PORT",
      value: env.port || "3060",
      sensitive: false,
      category: "Server",
    },
    {
      name: "NODE_ENV",
      value: env.nodeEnv || "development",
      sensitive: false,
      category: "Server",
    },
    {
      name: "LOG_FORMAT",
      value: env.logFormat || "text",
      sensitive: false,
      category: "Server",
    },
    {
      name: "DEBUG",
      value: env.debug || "false",
      sensitive: false,
      category: "Server",
    },
  );

  // HTTP configuration - conditional display
  if (env.allowedOrigins) {
    vars.push({
      name: "ALLOWED_ORIGINS",
      value: env.allowedOrigins,
      sensitive: false,
      category: "HTTP",
    });
  }
  if (env.allowedHosts) {
    vars.push({
      name: "ALLOWED_HOSTS",
      value: env.allowedHosts,
      sensitive: false,
      category: "HTTP",
    });
  }
  vars.push(
    {
      name: "ENABLE_OAUTH",
      value: env.enableOAuth || "false",
      sensitive: false,
      category: "HTTP",
    },
    {
      name: "ENABLE_RESUMABILITY",
      value: env.enableResumability || "false",
      sensitive: false,
      category: "HTTP",
    },
  );

  // Scraping services - API key is sensitive
  if (env.firecrawlApiKey) {
    vars.push({
      name: "FIRECRAWL_API_KEY",
      value: env.firecrawlApiKey,
      sensitive: true,
      category: "Scraping",
    });
  }
  if (env.firecrawlBaseUrl) {
    vars.push({
      name: "FIRECRAWL_BASE_URL",
      value: env.firecrawlBaseUrl,
      sensitive: false,
      category: "Scraping",
    });
  }
  vars.push({
    name: "OPTIMIZE_FOR",
    value: env.optimizeFor || "cost",
    sensitive: false,
    category: "Scraping",
  });

  // LLM provider - conditional display, API key is sensitive
  if (env.llmProvider) {
    vars.push({
      name: "LLM_PROVIDER",
      value: env.llmProvider,
      sensitive: false,
      category: "LLM",
    });
  }
  if (env.llmApiKey) {
    vars.push({
      name: "LLM_API_KEY",
      value: env.llmApiKey,
      sensitive: true,
      category: "LLM",
    });
  }
  if (env.llmApiBaseUrl) {
    vars.push({
      name: "LLM_API_BASE_URL",
      value: env.llmApiBaseUrl,
      sensitive: false,
      category: "LLM",
    });
  }
  if (env.llmModel) {
    vars.push({
      name: "LLM_MODEL",
      value: env.llmModel,
      sensitive: false,
      category: "LLM",
    });
  }

  // Storage configuration
  vars.push({
    name: "MCP_RESOURCE_STORAGE",
    value: env.resourceStorage || "memory",
    sensitive: false,
    category: "Storage",
  });
  if (env.resourceFilesystemRoot) {
    vars.push({
      name: "MCP_RESOURCE_FILESYSTEM_ROOT",
      value: env.resourceFilesystemRoot,
      sensitive: false,
      category: "Storage",
    });
  }

  return vars;
}

/**
 * Format environment variables for colorized display output
 *
 * Groups variables by category, masks sensitive values (API keys),
 * and applies color coding for better readability. Each category
 * is separated by blank lines for visual clarity.
 *
 * @returns Array of formatted output lines ready for console.log
 */
export function formatEnvironmentVariables(): string[] {
  const vars = getEnvironmentVariables();
  const lines: string[] = [];

  // Group by category and maintain insertion order
  const categories = [...new Set(vars.map((v) => v.category))];

  for (const category of categories) {
    const categoryVars = vars.filter((v) => v.category === category);
    lines.push("");
    lines.push(colorHelpers.info(`  ${category}:`));

    for (const envVar of categoryVars) {
      const value = envVar.sensitive
        ? colorHelpers.dim(maskSensitiveValue(envVar.value))
        : colorHelpers.highlight(envVar.value);

      lines.push(`    ${colorHelpers.dim(envVar.name)}: ${value}`);
    }
  }

  return lines;
}
