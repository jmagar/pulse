import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryResourceStorage } from '../storage/resources/backends/memory.js';
import { FileSystemResourceStorage } from '../storage/resources/backends/filesystem.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Cache Eviction - TTL Support', () => {
  describe('MemoryResourceStorage - TTL', () => {
    let storage: MemoryResourceStorage;

    beforeEach(() => {
      storage = new MemoryResourceStorage({
        defaultTTL: 1000, // 1 second for fast tests
      });
    });

    it('should evict expired resources on read', async () => {
      const url = 'https://example.com/ttl-test';
      const uri = await storage.write(url, 'content');

      // Resource should exist immediately
      expect(await storage.exists(uri)).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Resource should be evicted on read attempt
      await expect(storage.read(uri)).rejects.toThrow('Resource not found');
    });

    it('should respect custom TTL per resource', async () => {
      const url = 'https://example.com/custom-ttl';
      const uri = await storage.write(url, 'content', { ttl: 2000 }); // 2 seconds

      // Wait 1.5 seconds (should still exist)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(await storage.exists(uri)).toBe(true);

      // Wait another 1 second (should be expired)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(await storage.exists(uri)).toBe(false);
    });

    it('should not expire resources with ttl=0 (infinite)', async () => {
      const url = 'https://example.com/infinite-ttl';
      const uri = await storage.write(url, 'content', { ttl: 0 });

      // Wait longer than default TTL
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Should still exist
      expect(await storage.exists(uri)).toBe(true);
      const result = await storage.read(uri);
      expect(result.text).toBe('content');
    });

    it('should update lastAccessTime on read', async () => {
      const url = 'https://example.com/access-time';
      const uri = await storage.write(url, 'content', { ttl: 0 });

      const stats1 = await storage.getStats();
      const resource1 = stats1.resources.find((r) => r.uri === uri);
      const firstAccessTime = resource1?.lastAccessTime;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Read the resource
      await storage.read(uri);

      const stats2 = await storage.getStats();
      const resource2 = stats2.resources.find((r) => r.uri === uri);
      const secondAccessTime = resource2?.lastAccessTime;

      expect(secondAccessTime).toBeGreaterThan(firstAccessTime!);
    });
  });

  describe('FileSystemResourceStorage - TTL', () => {
    let storage: FileSystemResourceStorage;
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `pulse-ttl-test-${Date.now()}`);
      storage = new FileSystemResourceStorage(testDir, {
        defaultTTL: 1000, // 1 second
      });
      await storage.init();
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should evict expired resources on read', async () => {
      const url = 'https://example.com/fs-ttl';
      const uri = await storage.write(url, 'content');

      // Resource should exist
      expect(await storage.exists(uri)).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Resource should be considered expired
      expect(await storage.exists(uri)).toBe(false);
    });

    it('should respect custom TTL in metadata', async () => {
      const url = 'https://example.com/fs-custom-ttl';
      const uri = await storage.write(url, 'content', { ttl: 2000 });

      // Wait 1.5 seconds
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(await storage.exists(uri)).toBe(true);

      // Wait until expired
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(await storage.exists(uri)).toBe(false);
    });
  });
});

describe('Cache Eviction - LRU Policy', () => {
  describe('MemoryResourceStorage - LRU', () => {
    let storage: MemoryResourceStorage;

    beforeEach(() => {
      storage = new MemoryResourceStorage({
        maxItems: 3,
        maxSizeBytes: 1024, // 1KB
      });
    });

    it('should evict least recently used item when maxItems exceeded', async () => {
      // Write 3 items
      const uri1 = await storage.write('https://example.com/1', 'content1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uri2 = await storage.write('https://example.com/2', 'content2');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uri3 = await storage.write('https://example.com/3', 'content3');

      // All should exist
      expect(await storage.exists(uri1)).toBe(true);
      expect(await storage.exists(uri2)).toBe(true);
      expect(await storage.exists(uri3)).toBe(true);

      // Write 4th item - should evict uri1 (least recently used)
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uri4 = await storage.write('https://example.com/4', 'content4');

      expect(await storage.exists(uri1)).toBe(false);
      expect(await storage.exists(uri2)).toBe(true);
      expect(await storage.exists(uri3)).toBe(true);
      expect(await storage.exists(uri4)).toBe(true);
    });

    it('should update LRU order on read access', async () => {
      // Write 3 items
      const uri1 = await storage.write('https://example.com/1', 'content1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uri2 = await storage.write('https://example.com/2', 'content2');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uri3 = await storage.write('https://example.com/3', 'content3');

      // Access uri1 to make it recently used
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.read(uri1);

      // Write 4th item - should evict uri2 (now least recently used)
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uri4 = await storage.write('https://example.com/4', 'content4');

      expect(await storage.exists(uri1)).toBe(true); // Still exists (was accessed)
      expect(await storage.exists(uri2)).toBe(false); // Evicted (LRU)
      expect(await storage.exists(uri3)).toBe(true);
      expect(await storage.exists(uri4)).toBe(true);
    });

    it('should evict items when size limit exceeded', async () => {
      // Write items that will exceed 1KB total
      const largeContent = 'x'.repeat(400); // 400 bytes each
      await storage.write('https://example.com/1', largeContent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.write('https://example.com/2', largeContent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.write('https://example.com/3', largeContent);

      // Total is 1200 bytes, exceeds limit
      // Oldest items should be evicted to make room
      const stats = await storage.getStats();
      expect(stats.totalSizeBytes).toBeLessThanOrEqual(1024);
      expect(stats.itemCount).toBeLessThan(3);
    });

    it('should provide accurate cache statistics', async () => {
      void await storage.write('https://example.com/1', 'test');
      await new Promise((resolve) => setTimeout(resolve, 10));
      void await storage.write('https://example.com/2', 'test2');

      const stats = await storage.getStats();

      expect(stats.itemCount).toBe(2);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.maxItems).toBe(3);
      expect(stats.maxSizeBytes).toBe(1024);
      expect(stats.resources).toHaveLength(2);
    });
  });

  describe('FileSystemResourceStorage - Size Limits', () => {
    let storage: FileSystemResourceStorage;
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `pulse-lru-test-${Date.now()}`);
      storage = new FileSystemResourceStorage(testDir, {
        maxItems: 3,
        maxSizeBytes: 2048, // 2KB
      });
      await storage.init();
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should enforce item count limit', async () => {
      // Write 4 items
      await storage.write('https://example.com/1', 'content1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.write('https://example.com/2', 'content2');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.write('https://example.com/3', 'content3');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.write('https://example.com/4', 'content4');

      const stats = await storage.getStats();
      expect(stats.itemCount).toBeLessThanOrEqual(3);
    });

    it('should enforce size limit', async () => {
      const largeContent = 'x'.repeat(800); // 800 bytes each

      await storage.write('https://example.com/1', largeContent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.write('https://example.com/2', largeContent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.write('https://example.com/3', largeContent);

      const stats = await storage.getStats();
      expect(stats.totalSizeBytes).toBeLessThanOrEqual(2048);
    });
  });
});

describe('Cache Eviction - Background Cleanup', () => {
  describe('MemoryResourceStorage - Cleanup Task', () => {
    it('should run cleanup task periodically', async () => {
      const storage = new MemoryResourceStorage({
        defaultTTL: 100, // 100ms
        cleanupInterval: 200, // 200ms cleanup interval
      });

      // Start cleanup task
      storage.startCleanup();

      // Write resources that will expire
      await storage.write('https://example.com/1', 'content1');
      await storage.write('https://example.com/2', 'content2');

      const statsBefore = await storage.getStats();
      expect(statsBefore.itemCount).toBe(2);

      // Wait for expiration + cleanup
      await new Promise((resolve) => setTimeout(resolve, 400));

      const statsAfter = await storage.getStats();
      expect(statsAfter.itemCount).toBe(0);

      // Stop cleanup
      storage.stopCleanup();
    });

    it('should stop cleanup task on stopCleanup', async () => {
      const storage = new MemoryResourceStorage({
        defaultTTL: 10000, // Long TTL so items don't expire during test
        cleanupInterval: 100, // Fast interval
      });

      // Write some items
      await storage.write('https://example.com/1', 'content1');
      await storage.write('https://example.com/2', 'content2');

      storage.startCleanup();

      // Verify cleanup is running by checking that stats still shows 2 items
      await new Promise((resolve) => setTimeout(resolve, 150));
      const statsDuringCleanup = await storage.getStats();
      expect(statsDuringCleanup.itemCount).toBe(2);

      storage.stopCleanup();

      // After stopping, items should still be there
      const statsAfterStop = await storage.getStats();
      expect(statsAfterStop.itemCount).toBe(2);
    });
  });

  describe('FileSystemResourceStorage - Cleanup Task', () => {
    let storage: FileSystemResourceStorage;
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `pulse-cleanup-test-${Date.now()}`);
      storage = new FileSystemResourceStorage(testDir, {
        defaultTTL: 100,
        cleanupInterval: 200,
      });
      await storage.init();
    });

    afterEach(async () => {
      storage.stopCleanup();
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    });

    it('should clean up expired files periodically', async () => {
      storage.startCleanup();

      await storage.write('https://example.com/1', 'content1');
      await storage.write('https://example.com/2', 'content2');

      const statsBefore = await storage.getStats();
      expect(statsBefore.itemCount).toBe(2);

      // Wait for expiration + cleanup
      await new Promise((resolve) => setTimeout(resolve, 400));

      const statsAfter = await storage.getStats();
      expect(statsAfter.itemCount).toBe(0);
    });
  });
});

describe('Cache Eviction - Configuration', () => {
  it('should use environment variable for default TTL', () => {
    const originalEnv = process.env.MCP_RESOURCE_TTL;
    process.env.MCP_RESOURCE_TTL = '3600';

    const storage = new MemoryResourceStorage();
    const stats = storage.getStatsSync();

    expect(stats.defaultTTL).toBe(3600000); // 3600 seconds = 3600000ms

    // Restore
    if (originalEnv) {
      process.env.MCP_RESOURCE_TTL = originalEnv;
    } else {
      delete process.env.MCP_RESOURCE_TTL;
    }
  });

  it('should use environment variable for max size', () => {
    const originalEnv = process.env.MCP_RESOURCE_MAX_SIZE;
    process.env.MCP_RESOURCE_MAX_SIZE = '50';

    const storage = new MemoryResourceStorage();
    const stats = storage.getStatsSync();

    expect(stats.maxSizeBytes).toBe(50 * 1024 * 1024); // 50MB in bytes

    // Restore
    if (originalEnv) {
      process.env.MCP_RESOURCE_MAX_SIZE = originalEnv;
    } else {
      delete process.env.MCP_RESOURCE_MAX_SIZE;
    }
  });

  it('should use environment variable for max items', () => {
    const originalEnv = process.env.MCP_RESOURCE_MAX_ITEMS;
    process.env.MCP_RESOURCE_MAX_ITEMS = '500';

    const storage = new MemoryResourceStorage();
    const stats = storage.getStatsSync();

    expect(stats.maxItems).toBe(500);

    // Restore
    if (originalEnv) {
      process.env.MCP_RESOURCE_MAX_ITEMS = originalEnv;
    } else {
      delete process.env.MCP_RESOURCE_MAX_ITEMS;
    }
  });

  it('should use default values when env vars not set', () => {
    const originalTTL = process.env.MCP_RESOURCE_TTL;
    const originalSize = process.env.MCP_RESOURCE_MAX_SIZE;
    const originalItems = process.env.MCP_RESOURCE_MAX_ITEMS;

    delete process.env.MCP_RESOURCE_TTL;
    delete process.env.MCP_RESOURCE_MAX_SIZE;
    delete process.env.MCP_RESOURCE_MAX_ITEMS;

    const storage = new MemoryResourceStorage();
    const stats = storage.getStatsSync();

    expect(stats.defaultTTL).toBe(86400000); // 24h in ms
    expect(stats.maxSizeBytes).toBe(100 * 1024 * 1024); // 100MB
    expect(stats.maxItems).toBe(1000);

    // Restore
    if (originalTTL) process.env.MCP_RESOURCE_TTL = originalTTL;
    if (originalSize) process.env.MCP_RESOURCE_MAX_SIZE = originalSize;
    if (originalItems) process.env.MCP_RESOURCE_MAX_ITEMS = originalItems;
  });
});
