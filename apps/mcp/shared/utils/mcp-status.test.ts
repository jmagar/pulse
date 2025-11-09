import { describe, it, expect, beforeEach } from 'vitest';
import { RegistrationStatus, registrationTracker, formatRegistrationStatus } from './mcp-status.js';

describe('MCP Registration Tracking', () => {
  beforeEach(() => {
    registrationTracker.clear();
  });

  describe('registrationTracker', () => {
    it('should record successful tool registration', () => {
      // RED: This will fail because registrationTracker doesn't exist
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });

      const registrations = registrationTracker.getRegistrations();

      expect(registrations).toHaveLength(1);
      expect(registrations[0].name).toBe('scrape');
      expect(registrations[0].type).toBe('tool');
      expect(registrations[0].success).toBe(true);
      expect(registrations[0].timestamp).toBeGreaterThan(0);
    });

    it('should record failed registration with error', () => {
      registrationTracker.recordRegistration({
        name: 'search',
        type: 'tool',
        success: false,
        error: 'Invalid configuration',
      });

      const registrations = registrationTracker.getRegistrations();

      expect(registrations[0].success).toBe(false);
      expect(registrations[0].error).toBe('Invalid configuration');
    });

    it('should get tool registrations only', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'Resource Handlers',
        type: 'resource',
        success: true,
      });

      const tools = registrationTracker.getToolRegistrations();

      expect(tools).toHaveLength(1);
      expect(tools[0].type).toBe('tool');
    });

    it('should get resource registrations only', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'Resource Handlers',
        type: 'resource',
        success: true,
      });

      const resources = registrationTracker.getResourceRegistrations();

      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('resource');
    });

    it('should detect failures', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'search',
        type: 'tool',
        success: false,
      });

      expect(registrationTracker.hasFailures()).toBe(true);
    });

    it('should detect no failures', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });

      expect(registrationTracker.hasFailures()).toBe(false);
    });

    it('should clear all registrations', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });

      registrationTracker.clear();

      expect(registrationTracker.getRegistrations()).toHaveLength(0);
    });
  });

  describe('formatRegistrationStatus()', () => {
    it('should return empty lines when no registrations', () => {
      // RED: This will fail because formatRegistrationStatus() doesn't exist
      const lines = formatRegistrationStatus();

      expect(lines).toEqual([]);
    });

    it('should format successful tool registrations', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'search',
        type: 'tool',
        success: true,
      });

      const lines = formatRegistrationStatus();

      expect(lines.some((l) => l.includes('Tools (2)'))).toBe(true);
      expect(lines.some((l) => l.includes('scrape'))).toBe(true);
      expect(lines.some((l) => l.includes('search'))).toBe(true);
    });

    it('should format failed registrations with errors', () => {
      registrationTracker.recordRegistration({
        name: 'search',
        type: 'tool',
        success: false,
        error: 'Missing API key',
      });

      const lines = formatRegistrationStatus();

      expect(lines.some((l) => l.includes('search'))).toBe(true);
      expect(lines.some((l) => l.includes('Missing API key'))).toBe(true);
    });

    it('should group tools and resources separately', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'Resource Handlers',
        type: 'resource',
        success: true,
      });

      const lines = formatRegistrationStatus();

      expect(lines.some((l) => l.includes('Tools (1)'))).toBe(true);
      expect(lines.some((l) => l.includes('Resources (1)'))).toBe(true);
    });
  });
});
