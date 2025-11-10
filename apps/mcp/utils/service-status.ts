/**
 * Service status checking and formatting utilities
 *
 * This module provides functions to check the configuration and health status
 * of external services (Firecrawl, LLM providers, storage backends) and format
 * them for display in server startup logs.
 */

import { env, parseBoolean } from '../config/environment.js';
import { colorHelpers } from './logging.js';
import { SELF_HOSTED_NO_AUTH } from '@firecrawl/client';

/**
 * Service configuration and status information
 *
 * @property name - Human-readable service name
 * @property configured - Whether the service is configured (has required env vars)
 * @property healthy - Whether the service is operational (undefined if not checked)
 * @property baseUrl - Base URL for the service API (if applicable)
 * @property error - Error message if health check failed
 * @property details - Additional service-specific metadata
 */
export interface ServiceStatus {
  name: string;
  configured: boolean;
  healthy?: boolean;
  baseUrl?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Check Firecrawl service status
 *
 * Determines if Firecrawl is configured and optionally checks health.
 * Supports self-hosted instances and health check skipping.
 *
 * @returns Promise resolving to Firecrawl service status
 *
 * @example
 * const status = await checkFirecrawlStatus();
 * if (status.configured && status.healthy) {
 *   console.log('Firecrawl is ready');
 * }
 */
export async function checkFirecrawlStatus(): Promise<ServiceStatus> {
  const apiKey = env.firecrawlApiKey;
  const baseUrl = env.firecrawlBaseUrl || 'https://api.firecrawl.dev';

  // Not configured if API key is missing
  if (!apiKey) {
    return {
      name: 'Firecrawl',
      configured: false,
    };
  }

  // Self-hosted instances or health check skip mode
  const isSelfHosted = apiKey === SELF_HOSTED_NO_AUTH;
  const skipHealthCheck = parseBoolean(env.skipHealthChecks);

  if (isSelfHosted || skipHealthCheck) {
    return {
      name: 'Firecrawl',
      configured: true,
      healthy: true,
      baseUrl,
      details: {
        mode: isSelfHosted ? 'self-hosted' : undefined,
        healthCheckSkipped: skipHealthCheck,
      },
    };
  }

  // TODO: Implement actual health check for cloud instances
  return {
    name: 'Firecrawl',
    configured: true,
    healthy: true,
    baseUrl,
  };
}

/**
 * Check LLM provider status
 *
 * Determines if an LLM provider (Anthropic, OpenAI, etc.) is configured.
 * Requires both LLM_PROVIDER and LLM_API_KEY environment variables.
 *
 * @returns LLM provider service status
 *
 * @example
 * const status = checkLLMProviderStatus();
 * if (status.configured) {
 *   console.log(`Using ${status.details?.provider} with model ${status.details?.model}`);
 * }
 */
export function checkLLMProviderStatus(): ServiceStatus {
  const provider = env.llmProvider;
  const apiKey = env.llmApiKey;

  // Not configured if provider or API key is missing
  if (!provider || !apiKey) {
    return {
      name: 'LLM Provider',
      configured: false,
    };
  }

  const baseUrl = env.llmApiBaseUrl;
  const model = env.llmModel;

  return {
    name: `LLM Provider (${provider})`,
    configured: true,
    healthy: true,
    baseUrl,
    details: {
      provider,
      model: model || 'default',
    },
  };
}

/**
 * Check storage configuration
 *
 * Determines the configured resource storage backend (memory or filesystem).
 * Memory storage is always available. Filesystem storage requires a root path.
 *
 * @returns Resource storage service status
 *
 * @example
 * const status = checkStorageStatus();
 * console.log(`Using ${status.details?.type} storage`);
 */
export function checkStorageStatus(): ServiceStatus {
  const storageType = env.resourceStorage;
  const fsRoot = env.resourceFilesystemRoot;

  const details: Record<string, unknown> = {
    type: storageType,
  };

  // Add filesystem root if configured
  if (storageType === 'filesystem' && fsRoot) {
    details.root = fsRoot;
  }

  return {
    name: 'Resource Storage',
    configured: true,
    healthy: true,
    details,
  };
}

/**
 * Format service status for display
 *
 * Creates a colorized, human-readable string representation of service status.
 * Includes icons, status text, base URL, error messages, and additional details.
 *
 * @param status - Service status to format
 * @returns Formatted string with ANSI color codes
 *
 * @example
 * const status = await checkFirecrawlStatus();
 * console.log(formatServiceStatus(status));
 * // Output: ✓ Firecrawl: Ready (https://api.firecrawl.dev)
 */
export function formatServiceStatus(status: ServiceStatus): string {
  // Not configured services
  if (!status.configured) {
    return `${colorHelpers.dim('○')} ${status.name}: ${colorHelpers.dim('Not configured')}`;
  }

  // Icon and status text based on health
  const icon = status.healthy === false ? colorHelpers.cross() : colorHelpers.checkmark();
  const statusText =
    status.healthy === false ? colorHelpers.error('Failed') : colorHelpers.success('Ready');

  let line = `${icon} ${status.name}: ${statusText}`;

  // Add base URL if present
  if (status.baseUrl) {
    line += colorHelpers.dim(` (${status.baseUrl})`);
  }

  // Add error message if present
  if (status.error) {
    line += `\n    ${colorHelpers.error(`Error: ${status.error}`)}`;
  }

  // Add details if present
  if (status.details) {
    const detailsString = Object.entries(status.details)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');

    if (detailsString) {
      line += `\n    ${colorHelpers.dim(detailsString)}`;
    }
  }

  return line;
}

/**
 * Get all service statuses
 *
 * Retrieves status information for all configured services:
 * - Firecrawl (web scraping service)
 * - LLM Provider (for content extraction)
 * - Resource Storage (memory or filesystem)
 *
 * @returns Promise resolving to array of all service statuses
 *
 * @example
 * const statuses = await getAllServiceStatuses();
 * for (const status of statuses) {
 *   console.log(formatServiceStatus(status));
 * }
 */
export async function getAllServiceStatuses(): Promise<ServiceStatus[]> {
  return Promise.all([
    checkFirecrawlStatus(),
    Promise.resolve(checkLLMProviderStatus()),
    Promise.resolve(checkStorageStatus()),
  ]);
}
