/**
 * MCP registration status tracking and display
 */

import { colorHelpers } from './logging.js';

/**
 * Registration status for a single item
 */
export interface RegistrationStatus {
  name: string;
  type: 'tool' | 'resource';
  success: boolean;
  error?: string;
  timestamp: number;
}

/**
 * Registration tracker singleton
 */
class RegistrationTracker {
  private static instance: RegistrationTracker;
  private registrations: RegistrationStatus[] = [];

  private constructor() {}

  static getInstance(): RegistrationTracker {
    if (!RegistrationTracker.instance) {
      RegistrationTracker.instance = new RegistrationTracker();
    }
    return RegistrationTracker.instance;
  }

  recordRegistration(status: Omit<RegistrationStatus, 'timestamp'>): void {
    this.registrations.push({
      ...status,
      timestamp: Date.now(),
    });
  }

  getRegistrations(): RegistrationStatus[] {
    return [...this.registrations];
  }

  getToolRegistrations(): RegistrationStatus[] {
    return this.registrations.filter((r) => r.type === 'tool');
  }

  getResourceRegistrations(): RegistrationStatus[] {
    return this.registrations.filter((r) => r.type === 'resource');
  }

  hasFailures(): boolean {
    return this.registrations.some((r) => !r.success);
  }

  clear(): void {
    this.registrations = [];
  }
}

export const registrationTracker = RegistrationTracker.getInstance();

/**
 * Format registration statuses for display
 */
export function formatRegistrationStatus(): string[] {
  const lines: string[] = [];
  const tracker = registrationTracker;

  const tools = tracker.getToolRegistrations();
  const resources = tracker.getResourceRegistrations();

  if (tools.length === 0 && resources.length === 0) {
    return [];
  }

  // Tools section
  if (tools.length > 0) {
    lines.push('');
    lines.push(colorHelpers.info(`  Tools (${tools.length}):`));

    for (const tool of tools) {
      const icon = tool.success ? colorHelpers.checkmark() : colorHelpers.cross();
      const name = tool.success ? colorHelpers.highlight(tool.name) : colorHelpers.error(tool.name);

      lines.push(`    ${icon} ${name}`);

      if (tool.error) {
        lines.push(`      ${colorHelpers.error(`Error: ${tool.error}`)}`);
      }
    }
  }

  // Resources section
  if (resources.length > 0) {
    lines.push('');
    lines.push(colorHelpers.info(`  Resources (${resources.length}):`));

    for (const resource of resources) {
      const icon = resource.success ? colorHelpers.checkmark() : colorHelpers.cross();
      const name = resource.success
        ? colorHelpers.highlight(resource.name)
        : colorHelpers.error(resource.name);

      lines.push(`    ${icon} ${name}`);

      if (resource.error) {
        lines.push(`      ${colorHelpers.error(`Error: ${resource.error}`)}`);
      }
    }
  }

  return lines;
}
