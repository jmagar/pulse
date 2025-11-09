/**
 * Environment variable display utilities for server startup logging
 *
 * Provides functions to collect and format environment variables with
 * proper masking of sensitive values (API keys) and categorization.
 */

import { colorHelpers, maskSensitiveValue } from '../../shared/utils/logging.js';

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
 * Helper function to add an environment variable if it exists
 *
 * @param vars - Array to add the variable to
 * @param name - Environment variable name
 * @param category - Display category
 * @param sensitive - Whether the value is sensitive and should be masked
 */
function addEnvVarIfExists(
  vars: EnvVarDisplay[],
  name: string,
  category: string,
  sensitive: boolean = false
): void {
  const value = process.env[name];
  if (value) {
    vars.push({ name, value, sensitive, category });
  }
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
  const vars: EnvVarDisplay[] = [];

  // Server configuration - always shown with defaults
  vars.push(
    { name: 'PORT', value: process.env.PORT || '3060', sensitive: false, category: 'Server' },
    {
      name: 'NODE_ENV',
      value: process.env.NODE_ENV || 'development',
      sensitive: false,
      category: 'Server',
    },
    {
      name: 'LOG_FORMAT',
      value: process.env.LOG_FORMAT || 'text',
      sensitive: false,
      category: 'Server',
    },
    { name: 'DEBUG', value: process.env.DEBUG || 'false', sensitive: false, category: 'Server' }
  );

  // HTTP configuration - conditional display
  addEnvVarIfExists(vars, 'ALLOWED_ORIGINS', 'HTTP');
  addEnvVarIfExists(vars, 'ALLOWED_HOSTS', 'HTTP');
  vars.push(
    {
      name: 'ENABLE_OAUTH',
      value: process.env.ENABLE_OAUTH || 'false',
      sensitive: false,
      category: 'HTTP',
    },
    {
      name: 'ENABLE_RESUMABILITY',
      value: process.env.ENABLE_RESUMABILITY || 'false',
      sensitive: false,
      category: 'HTTP',
    }
  );

  // Scraping services - API key is sensitive
  addEnvVarIfExists(vars, 'FIRECRAWL_API_KEY', 'Scraping', true);
  addEnvVarIfExists(vars, 'FIRECRAWL_BASE_URL', 'Scraping');
  vars.push({
    name: 'OPTIMIZE_FOR',
    value: process.env.OPTIMIZE_FOR || 'cost',
    sensitive: false,
    category: 'Scraping',
  });

  // LLM provider - conditional display, API key is sensitive
  addEnvVarIfExists(vars, 'LLM_PROVIDER', 'LLM');
  addEnvVarIfExists(vars, 'LLM_API_KEY', 'LLM', true);
  addEnvVarIfExists(vars, 'LLM_API_BASE_URL', 'LLM');
  addEnvVarIfExists(vars, 'LLM_MODEL', 'LLM');

  // Storage configuration
  vars.push({
    name: 'MCP_RESOURCE_STORAGE',
    value: process.env.MCP_RESOURCE_STORAGE || 'memory',
    sensitive: false,
    category: 'Storage',
  });
  addEnvVarIfExists(vars, 'MCP_RESOURCE_FILESYSTEM_ROOT', 'Storage');

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
    lines.push('');
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
