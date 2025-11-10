/**
 * Startup display orchestrator
 *
 * Provides a comprehensive, colorized display of server startup information including:
 * - Banner with server name
 * - Server endpoints (MCP, Health, Port)
 * - Security configuration (CORS, OAuth, Resumability)
 * - Service statuses (Firecrawl, LLM, Storage)
 * - Environment variables (masked sensitive values)
 * - MCP registration status (tools and resources)
 * - Active crawls
 */

import {
  colorHelpers,
  createSectionHeader,
  createLine,
  Colors,
  colorize,
} from '../../shared/utils/logging.js';
import { getAllServiceStatuses, formatServiceStatus } from '../../shared/utils/service-status.js';
import { formatEnvironmentVariables } from './env-display.js';
import { formatRegistrationStatus, registrationTracker } from '../../shared/utils/mcp-status.js';

// Display constants
const BANNER_WIDTH = 80;
const SECTION_WIDTH = 80;
const SEPARATOR_CHAR = '═';

/**
 * Server configuration for display
 */
export interface ServerConfig {
  port: number;
  serverUrl: string;
  mcpEndpoint: string;
  healthEndpoint: string;
  allowedOrigins: string[];
  allowedHosts: string[];
  oauthEnabled: boolean;
  resumabilityEnabled: boolean;
}

/**
 * Display startup banner
 */
function displayBanner(): void {
  const banner = [
    '',
    colorize(
      '╔═══════════════════════════════════════════════════════════════════════════════╗',
      Colors.cyan,
      Colors.bold
    ),
    colorize(
      '║                                                                               ║',
      Colors.cyan,
      Colors.bold
    ),
    colorize('║                       ', Colors.cyan, Colors.bold) +
      colorize('🌊 Pulse Fetch MCP Server', Colors.brightWhite, Colors.bold) +
      colorize('                        ║', Colors.cyan, Colors.bold),
    colorize(
      '║                                                                               ║',
      Colors.cyan,
      Colors.bold
    ),
    colorize('║                           ', Colors.cyan, Colors.bold) +
      colorize('Remote HTTP Transport', Colors.brightCyan) +
      colorize('                           ║', Colors.cyan, Colors.bold),
    colorize(
      '║                                                                               ║',
      Colors.cyan,
      Colors.bold
    ),
    colorize(
      '╚═══════════════════════════════════════════════════════════════════════════════╝',
      Colors.cyan,
      Colors.bold
    ),
    '',
  ].join('\n');

  console.log(banner);
}

/**
 * Display server endpoints
 *
 * Shows MCP endpoint, health check endpoint, and listening port
 */
function displayEndpoints(config: ServerConfig): void {
  console.log(createSectionHeader('Server Endpoints', SECTION_WIDTH));
  console.log('');
  console.log(
    `  ${colorHelpers.bullet()} MCP Endpoint:    ${colorHelpers.highlight(config.mcpEndpoint)}`
  );
  console.log(
    `  ${colorHelpers.bullet()} Health Endpoint: ${colorHelpers.highlight(config.healthEndpoint)}`
  );
  console.log(
    `  ${colorHelpers.bullet()} Port:            ${colorHelpers.highlight(String(config.port))}`
  );
  console.log('');
}

/**
 * Display security configuration
 *
 * Shows CORS origins, allowed hosts, OAuth status, and resumability status
 */
function displaySecurityConfig(config: ServerConfig): void {
  console.log(createSectionHeader('Security Configuration', SECTION_WIDTH));
  console.log('');

  const originsDisplay = config.allowedOrigins.includes('*')
    ? colorHelpers.warning('* (all origins)')
    : colorHelpers.highlight(config.allowedOrigins.join(', '));
  console.log(`  ${colorHelpers.bullet()} CORS Origins:    ${originsDisplay}`);

  if (config.allowedHosts.length > 0) {
    console.log(
      `  ${colorHelpers.bullet()} Allowed Hosts:   ${colorHelpers.highlight(config.allowedHosts.join(', '))}`
    );
  }

  const oauthStatus = config.oauthEnabled
    ? colorHelpers.warning('Enabled (not implemented)')
    : colorHelpers.dim('Disabled');
  console.log(`  ${colorHelpers.bullet()} OAuth:           ${oauthStatus}`);

  const resumabilityStatus = config.resumabilityEnabled
    ? colorHelpers.success('Enabled')
    : colorHelpers.dim('Disabled');
  console.log(`  ${colorHelpers.bullet()} Resumability:    ${resumabilityStatus}`);

  console.log('');
}

/**
 * Display service statuses
 *
 * Shows health status of all external services (Firecrawl, LLM, Storage)
 */
async function displayServiceStatuses(): Promise<void> {
  console.log(createSectionHeader('Service Status', SECTION_WIDTH));
  console.log('');

  const statuses = await getAllServiceStatuses();

  for (const status of statuses) {
    console.log(`  ${formatServiceStatus(status)}`);
  }

  console.log('');
}

/**
 * Display environment variables
 *
 * Shows all configured environment variables with sensitive values masked
 */
function displayEnvironmentVariables(): void {
  console.log(createSectionHeader('Environment Configuration', SECTION_WIDTH));

  const envLines = formatEnvironmentVariables();
  envLines.forEach((line) => console.log(line));

  console.log('');
}

/**
 * Display MCP registration status
 *
 * Shows status of all registered MCP tools and resources with success/failure indicators.
 * Note: Tools and resources are registered when clients connect, not at server startup.
 */
function displayMCPStatus(): void {
  console.log(createSectionHeader('MCP Registration Status', SECTION_WIDTH));

  const statusLines = formatRegistrationStatus();

  if (statusLines.length === 0) {
    console.log('');
    console.log(colorHelpers.dim('  Tools and resources will be registered when clients connect'));
    console.log(colorHelpers.dim('  Available: scrape, search, map, crawl'));
    console.log('');
    return;
  }

  statusLines.forEach((line) => console.log(line));

  const tracker = registrationTracker;
  const tools = tracker.getToolRegistrations();
  const resources = tracker.getResourceRegistrations();
  const hasFailures = tracker.hasFailures();

  console.log('');
  console.log(colorHelpers.dim('  ─'.repeat(40)));

  if (hasFailures) {
    console.log(`  ${colorHelpers.warning('⚠ Some registrations failed')}`);
  } else {
    console.log(`  ${colorHelpers.success('✓ All registrations successful')}`);
  }

  console.log(
    `  ${colorHelpers.dim(`Total: ${tools.length} tools, ${resources.length} resources`)}`
  );
  console.log('');
}

/**
 * Display active crawls
 *
 * Shows status of any active crawl jobs (currently placeholder)
 */
function displayActiveCrawls(): void {
  console.log(createSectionHeader('Active Crawls', SECTION_WIDTH));
  console.log('');
  console.log(colorHelpers.dim('  No active crawls'));
  console.log('');
}

/**
 * Display complete startup information
 *
 * Orchestrates the display of all startup sections in order:
 * 1. Banner
 * 2. Server endpoints
 * 3. Security configuration
 * 4. Service statuses
 * 5. Environment variables
 * 6. MCP registration status
 * 7. Active crawls
 * 8. Ready message
 *
 * Clears the screen if running in a TTY for a clean display
 */
export async function displayStartupInfo(config: ServerConfig): Promise<void> {
  if (process.stdout.isTTY) {
    console.clear();
  }

  displayBanner();
  displayEndpoints(config);
  displaySecurityConfig(config);
  await displayServiceStatuses();
  displayEnvironmentVariables();
  displayMCPStatus();
  displayActiveCrawls();

  console.log(colorize(createLine(BANNER_WIDTH, SEPARATOR_CHAR), Colors.cyan, Colors.bold));
  console.log('');
  console.log(colorHelpers.success('  ✓ Server ready to accept connections'));
  console.log('');
}
