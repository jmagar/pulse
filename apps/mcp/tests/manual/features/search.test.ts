import { describe, it, expect } from 'vitest';
import { FirecrawlSearchClient } from '../../../shared/clients/firecrawl/index.js';

describe('Firecrawl Search Client', () => {
  it('should perform basic web search', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('⚠️  Skipping Firecrawl Search test - FIRECRAWL_API_KEY not set');
      return;
    }

    const client = new FirecrawlSearchClient({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
    });

    console.log('🔍 Testing Firecrawl Search - Basic web search');
    console.log('============================================================');

    const result = await client.search({
      query: 'web scraping best practices',
      limit: 3,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.creditsUsed).toBeGreaterThan(0);

    console.log(`✅ Search successful`);
    console.log(`📊 Results found: ${Array.isArray(result.data) ? result.data.length : 'multi-source'}`);
    console.log(`💰 Credits used: ${result.creditsUsed}`);
  }, 30000);

  it('should search with multiple sources', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('⚠️  Skipping Firecrawl Search test - FIRECRAWL_API_KEY not set');
      return;
    }

    const client = new FirecrawlSearchClient({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
    });

    console.log('\n🔍 Testing Firecrawl Search - Multi-source search');
    console.log('============================================================');

    const result = await client.search({
      query: 'artificial intelligence',
      sources: ['web', 'news'],
      limit: 5,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    console.log(`✅ Multi-source search successful`);
    console.log(`💰 Credits used: ${result.creditsUsed}`);
  }, 30000);

  it('should search with content scraping', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('⚠️  Skipping Firecrawl Search test - FIRECRAWL_API_KEY not set');
      return;
    }

    const client = new FirecrawlSearchClient({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
    });

    console.log('\n🔍 Testing Firecrawl Search - Search with scraping');
    console.log('============================================================');

    const result = await client.search({
      query: 'firecrawl documentation',
      limit: 2,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    console.log(`✅ Search with scraping successful`);
    console.log(`💰 Credits used: ${result.creditsUsed}`);
  }, 30000);
});
