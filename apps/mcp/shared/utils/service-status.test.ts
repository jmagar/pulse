import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ServiceStatus,
  checkFirecrawlStatus,
  checkLLMProviderStatus,
  checkStorageStatus,
  formatServiceStatus,
  getAllServiceStatuses,
} from './service-status.js';

describe('Service Status Checking', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('checkFirecrawlStatus()', () => {
    it('should return not configured when API key is missing', async () => {
      // RED: This will fail because checkFirecrawlStatus() doesn't exist
      delete process.env.FIRECRAWL_API_KEY;

      const status = await checkFirecrawlStatus();

      expect(status.name).toBe('Firecrawl');
      expect(status.configured).toBe(false);
      expect(status.healthy).toBeUndefined();
    });

    it('should return healthy for self-hosted instances', async () => {
      process.env.FIRECRAWL_API_KEY = 'self-hosted-no-auth';
      process.env.FIRECRAWL_BASE_URL = 'https://firecrawl.local';

      const status = await checkFirecrawlStatus();

      expect(status.configured).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.baseUrl).toBe('https://firecrawl.local');
      expect(status.details?.mode).toBe('self-hosted');
    });

    it('should skip health check when SKIP_HEALTH_CHECKS is true', async () => {
      process.env.FIRECRAWL_API_KEY = 'sk-test123';
      process.env.SKIP_HEALTH_CHECKS = 'true';

      const status = await checkFirecrawlStatus();

      expect(status.configured).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.details?.healthCheckSkipped).toBe(true);
    });

    it('should use default base URL when not specified', async () => {
      process.env.FIRECRAWL_API_KEY = 'self-hosted-no-auth';
      delete process.env.FIRECRAWL_BASE_URL;

      const status = await checkFirecrawlStatus();

      expect(status.baseUrl).toBe('https://api.firecrawl.dev');
    });
  });

  describe('checkLLMProviderStatus()', () => {
    it('should return not configured when provider is missing', () => {
      // RED: This will fail because checkLLMProviderStatus() doesn't exist
      delete process.env.LLM_PROVIDER;

      const status = checkLLMProviderStatus();

      expect(status.name).toBe('LLM Provider');
      expect(status.configured).toBe(false);
    });

    it('should return not configured when API key is missing', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      delete process.env.LLM_API_KEY;

      const status = checkLLMProviderStatus();

      expect(status.configured).toBe(false);
    });

    it('should return configured status with provider details', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.LLM_API_KEY = 'sk-ant-test';
      process.env.LLM_MODEL = 'claude-sonnet-4';

      const status = checkLLMProviderStatus();

      expect(status.name).toContain('anthropic');
      expect(status.configured).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.details?.provider).toBe('anthropic');
      expect(status.details?.model).toBe('claude-sonnet-4');
    });

    it('should include base URL for openai-compatible providers', () => {
      process.env.LLM_PROVIDER = 'openai-compatible';
      process.env.LLM_API_KEY = 'test';
      process.env.LLM_API_BASE_URL = 'https://api.local';

      const status = checkLLMProviderStatus();

      expect(status.baseUrl).toBe('https://api.local');
    });
  });

  describe('checkStorageStatus()', () => {
    it('should return memory storage by default', () => {
      // RED: This will fail because checkStorageStatus() doesn't exist
      delete process.env.MCP_RESOURCE_STORAGE;

      const status = checkStorageStatus();

      expect(status.name).toBe('Resource Storage');
      expect(status.configured).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.details?.type).toBe('memory');
    });

    it('should return filesystem storage when configured', () => {
      process.env.MCP_RESOURCE_STORAGE = 'filesystem';
      process.env.MCP_RESOURCE_FILESYSTEM_ROOT = '/data/resources';

      const status = checkStorageStatus();

      expect(status.details?.type).toBe('filesystem');
      expect(status.details?.root).toBe('/data/resources');
    });
  });

  describe('formatServiceStatus()', () => {
    it('should format unconfigured service', () => {
      // RED: This will fail because formatServiceStatus() doesn't exist
      const status: ServiceStatus = {
        name: 'Test Service',
        configured: false,
      };

      const formatted = formatServiceStatus(status);

      expect(formatted).toContain('Test Service');
      expect(formatted).toContain('Not configured');
    });

    it('should format healthy service', () => {
      const status: ServiceStatus = {
        name: 'Test Service',
        configured: true,
        healthy: true,
        baseUrl: 'https://api.test',
      };

      const formatted = formatServiceStatus(status);

      expect(formatted).toContain('Test Service');
      expect(formatted).toContain('Ready');
      expect(formatted).toContain('https://api.test');
    });

    it('should format failed service with error', () => {
      const status: ServiceStatus = {
        name: 'Test Service',
        configured: true,
        healthy: false,
        error: 'Connection timeout',
      };

      const formatted = formatServiceStatus(status);

      expect(formatted).toContain('Failed');
      expect(formatted).toContain('Connection timeout');
    });

    it('should include details when present', () => {
      const status: ServiceStatus = {
        name: 'Test Service',
        configured: true,
        healthy: true,
        details: { mode: 'local', version: '1.0' },
      };

      const formatted = formatServiceStatus(status);

      expect(formatted).toContain('mode=local');
      expect(formatted).toContain('version=1.0');
    });
  });

  describe('getAllServiceStatuses()', () => {
    it('should return all service statuses', async () => {
      // RED: This will fail because getAllServiceStatuses() doesn't exist
      process.env.FIRECRAWL_API_KEY = 'self-hosted-no-auth';
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.LLM_API_KEY = 'test';

      const statuses = await getAllServiceStatuses();

      expect(statuses).toHaveLength(3);
      expect(statuses[0].name).toBe('Firecrawl');
      expect(statuses[1].name).toContain('LLM Provider');
      expect(statuses[2].name).toBe('Resource Storage');
    });
  });
});
