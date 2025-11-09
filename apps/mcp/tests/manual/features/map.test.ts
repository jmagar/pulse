import { describe, it, expect } from 'vitest';
import { FirecrawlMapClient } from '@firecrawl/client';

describe('Firecrawl Map Client', () => {
  it('should discover URLs from website', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('⚠️  Skipping Firecrawl Map test - FIRECRAWL_API_KEY not set');
      return;
    }

    const client = new FirecrawlMapClient({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
    });

    console.log('🗺️  Testing Firecrawl Map - Basic URL discovery');
    console.log('============================================================');

    const startTime = Date.now();
    const result = await client.map({
      url: 'https://firecrawl.dev',
      limit: 100,
    });
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.links).toBeDefined();
    expect(Array.isArray(result.links)).toBe(true);

    console.log(`✅ URL discovery successful`);
    console.log(`🔗 URLs discovered: ${result.links.length}`);
    console.log(`⏱️  Duration: ${duration}ms`);
  }, 30000);

  it('should filter URLs with search parameter', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('⚠️  Skipping Firecrawl Map test - FIRECRAWL_API_KEY not set');
      return;
    }

    const client = new FirecrawlMapClient({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
    });

    console.log('\n🗺️  Testing Firecrawl Map - URL filtering');
    console.log('============================================================');

    const result = await client.map({
      url: 'https://firecrawl.dev',
      search: 'docs',
      limit: 50,
    });

    expect(result.success).toBe(true);
    expect(result.links).toBeDefined();

    console.log(`✅ URL filtering successful`);
    console.log(`🔗 URLs matching "docs": ${result.links.length}`);
  }, 30000);

  it('should use sitemap-only discovery', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('⚠️  Skipping Firecrawl Map test - FIRECRAWL_API_KEY not set');
      return;
    }

    const client = new FirecrawlMapClient({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
    });

    console.log('\n🗺️  Testing Firecrawl Map - Sitemap-only discovery');
    console.log('============================================================');

    const result = await client.map({
      url: 'https://firecrawl.dev',
      sitemap: 'only',
      limit: 50,
    });

    expect(result.success).toBe(true);
    expect(result.links).toBeDefined();

    console.log(`✅ Sitemap discovery successful`);
    console.log(`🔗 URLs from sitemap: ${result.links.length}`);
  }, 30000);
});
