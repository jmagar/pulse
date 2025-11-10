#!/usr/bin/env node

import { config } from 'dotenv';
import { createExpressServer } from './server.js';
import { runHealthChecks, type HealthCheckResult } from './shared/config/health-checks.js';
import { logInfo, logError } from './shared/utils/logging.js';
import { displayStartupInfo } from './startup/display.js';

// Load environment variables (quiet mode to suppress v17 logging)
config({ quiet: true });

/**
 * Validates environment variables
 *
 * Only validates that required environment variables are present and valid.
 * Detailed configuration is displayed in the startup banner.
 */
function validateEnvironment(): void {
  // Validate OPTIMIZE_FOR if provided
  const optimizeFor = process.env.OPTIMIZE_FOR;
  if (optimizeFor && !['cost', 'speed'].includes(optimizeFor)) {
    logError('validateEnvironment', new Error(`Invalid OPTIMIZE_FOR value: ${optimizeFor}`), {
      validValues: ['cost', 'speed'],
    });
    process.exit(1);
  }
}

/**
 * Main entry point for the HTTP streaming MCP server
 */
async function main(): Promise<void> {
  validateEnvironment();

  // Run health checks if not skipped
  if (process.env.SKIP_HEALTH_CHECKS !== 'true') {
    logInfo('healthCheck', 'Running authentication health checks...');
    const healthResults = await runHealthChecks();

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

  // Create Express server
  const app = await createExpressServer();
  const port = parseInt(process.env.PORT || '3060', 10);

  // Start listening
  const server = app.listen(port, async () => {
    const serverConfig = {
      port,
      serverUrl: `http://localhost:${port}`,
      mcpEndpoint: `http://localhost:${port}/mcp`,
      healthEndpoint: `http://localhost:${port}/health`,
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || ['*'],
      allowedHosts: process.env.ALLOWED_HOSTS?.split(',').filter(Boolean) || [],
      oauthEnabled: process.env.ENABLE_OAUTH === 'true',
      resumabilityEnabled: process.env.ENABLE_RESUMABILITY === 'true',
    };

    await displayStartupInfo(serverConfig);
  });

  // Handle server startup errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logError('serverStartup', new Error(`Port ${port} is already in use`), {
        port,
        suggestion: 'Please set a different PORT in your environment variables',
      });
    } else {
      logError('serverStartup', error, { port });
    }
    process.exit(1);
  });
}

// Run main and handle errors
main().catch((error) => {
  logError('main', error);
  process.exit(1);
});
