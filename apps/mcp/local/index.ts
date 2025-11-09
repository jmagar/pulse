#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMCPServer } from './shared/index.js';
import { runHealthChecks, type HealthCheckResult } from './shared/config/health-checks.js';
import { logInfo, logError } from './shared/utils/logging.js';

// Validate environment variables
function validateEnvironment() {
  const required: Array<{ name: string; description: string }> = [];

  // Check required variables
  const missing = required.filter(({ name }) => !process.env[name]);

  if (missing.length > 0) {
    logError('validateEnvironment', new Error('Missing required environment variables'), {
      missing: missing.map(({ name, description }) => `${name}: ${description}`),
    });
    process.exit(1);
  }

  // Validate OPTIMIZE_FOR if provided (normalize to lowercase for compatibility)
  const optimizeForRaw = process.env.OPTIMIZE_FOR;
  const optimizeFor = optimizeForRaw?.toLowerCase();

  if (optimizeForRaw && !['cost', 'speed'].includes(optimizeFor!)) {
    logError('validateEnvironment', new Error(`Invalid OPTIMIZE_FOR value: ${optimizeForRaw}`), {
      validValues: ['cost', 'speed'],
    });
    process.exit(1);
  }

  // Log available services
  const available = [];
  if (process.env.FIRECRAWL_API_KEY) available.push('Firecrawl');

  logInfo(
    'startup',
    `Pulse Fetch starting with services: native${available.length > 0 ? ', ' + available.join(', ') : ''}`,
    {
      services: ['native', ...available],
    }
  );

  if (optimizeFor) {
    logInfo('startup', `Optimization strategy: ${optimizeFor}`, { optimizeFor });
  }

  // Log debug mode status
  if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
    logInfo('startup', 'Debug mode enabled - tool schemas will be logged');
  } else {
    logInfo('startup', 'To enable debug logging, set DEBUG=true environment variable');
  }
}

async function main() {
  validateEnvironment();

  // Run health checks if SKIP_HEALTH_CHECKS is not set
  if (process.env.SKIP_HEALTH_CHECKS !== 'true') {
    logInfo('healthCheck', 'Running authentication health checks...');

    const HEALTH_CHECK_TIMEOUT = 30000; // 30 seconds
    const healthCheckPromise = runHealthChecks();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT);
    });

    let healthResults: HealthCheckResult[];
    try {
      healthResults = await Promise.race([healthCheckPromise, timeoutPromise]);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      logError('healthCheck', error as Error, {
        message: 'Health check failed or timed out',
      });
      logInfo('healthCheck', 'To skip health checks, set SKIP_HEALTH_CHECKS=true');
      process.exit(1);
    }

    const failedChecks = healthResults.filter((result: HealthCheckResult) => !result.success);
    if (failedChecks.length > 0) {
      logError('healthCheck', new Error('Authentication health check failures'), {
        failures: failedChecks.map((check) => ({
          service: check.service,
          error: check.error || 'Unknown error',
        })),
      });
      logInfo('healthCheck', 'To skip health checks, set SKIP_HEALTH_CHECKS=true');
      process.exit(1);
    }

    const successfulChecks = healthResults.filter((result: HealthCheckResult) => result.success);
    if (successfulChecks.length > 0) {
      logInfo('healthCheck', 'Health checks passed', {
        services: successfulChecks.map((r: HealthCheckResult) => r.service),
      });
    }
  }

  const { server, registerHandlers } = createMCPServer();
  await registerHandlers(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  logError('main', error);
  process.exit(1);
});
