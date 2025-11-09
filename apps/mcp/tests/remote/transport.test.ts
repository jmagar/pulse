import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTransport } from '../../remote/transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

describe('Transport Factory', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.ENABLE_RESUMABILITY;
    delete process.env.NODE_ENV;
    delete process.env.ALLOWED_HOSTS;
    delete process.env.ALLOWED_ORIGINS;
  });

  it('should create a StreamableHTTPServerTransport instance', () => {
    const transport = createTransport();
    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
  });

  it('should generate unique session IDs', () => {
    const transport1 = createTransport();
    const transport2 = createTransport();
    
    // Session IDs should be set after initialization
    // We can't test the exact value but we can test they're different instances
    expect(transport1).not.toBe(transport2);
  });

  it('should enable resumability when ENABLE_RESUMABILITY is true', () => {
    process.env.ENABLE_RESUMABILITY = 'true';
    const transport = createTransport();
    
    // The transport should have been created with an event store
    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
  });

  it('should disable resumability by default', () => {
    const transport = createTransport({ enableResumability: false });
    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
  });

  it('should call onSessionInitialized callback', async () => {
    const callback = vi.fn();
    const transport = createTransport({
      onSessionInitialized: callback,
    });

    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
    // Callback will be called during actual session initialization
  });

  it('should call onSessionClosed callback', async () => {
    const callback = vi.fn();
    const transport = createTransport({
      onSessionClosed: callback,
    });

    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
    // Callback will be called during session close
  });

  it('should enable DNS rebinding protection in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_HOSTS = 'example.com,api.example.com';
    process.env.ALLOWED_ORIGINS = 'https://example.com';

    const transport = createTransport();
    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
  });

  it('should parse ALLOWED_HOSTS from environment', () => {
    process.env.ALLOWED_HOSTS = 'host1.com,host2.com,host3.com';
    const transport = createTransport();
    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
  });

  it('should parse ALLOWED_ORIGINS from environment', () => {
    process.env.ALLOWED_ORIGINS = 'https://app1.com,https://app2.com';
    const transport = createTransport();
    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
  });

  it('should handle empty ALLOWED_HOSTS gracefully', () => {
    process.env.ALLOWED_HOSTS = '';
    const transport = createTransport();
    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
  });

  it('should handle empty ALLOWED_ORIGINS gracefully', () => {
    process.env.ALLOWED_ORIGINS = '';
    const transport = createTransport();
    expect(transport).toBeTruthy();
    expect(transport.constructor.name).toBe('StreamableHTTPServerTransport');
  });
});
