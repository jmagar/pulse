import { describe, it, expect } from 'vitest';
import { FirecrawlCrawlClient } from '@firecrawl/client';

describe('Firecrawl Crawl Client', () => {
  it('should start, monitor, and cancel crawl job', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('⚠️  Skipping Firecrawl Crawl test - FIRECRAWL_API_KEY not set');
      return;
    }

    const client = new FirecrawlCrawlClient({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
    });

    console.log('🕷️  Testing Firecrawl Crawl - Complete lifecycle');
    console.log('============================================================');

    // Step 1: Start crawl
    console.log('\n📍 Step 1: Starting crawl job...');
    const startResult = await client.startCrawl({
      url: 'https://firecrawl.dev',
      limit: 5,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    });

    expect(startResult.success).toBe(true);
    expect(startResult.id).toBeDefined();

    console.log(`✅ Crawl job started: ${startResult.id}`);

    const jobId = startResult.id;

    // Type guard: Ensure jobId is defined before proceeding
    if (!jobId) {
      throw new Error('jobId is undefined after successful crawl start');
    }

    // Step 2: Monitor progress
    console.log('\n📍 Step 2: Monitoring crawl progress...');
    let attempts = 0;
    const maxAttempts = 20;
    let statusResult;

    while (attempts < maxAttempts) {
      statusResult = await client.getCrawlStatus(jobId);
      console.log(`   Status: ${statusResult.status}, Progress: ${statusResult.completed}/${statusResult.total}`);

      if (statusResult.status === 'completed' || statusResult.status === 'failed') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
      attempts++;
    }

    expect(statusResult).toBeDefined();

    if (statusResult?.status === 'completed') {
      console.log(`✅ Crawl completed! Crawled ${statusResult.completed} pages`);
      console.log(`💰 Credits used: ${statusResult.creditsUsed}`);
      console.log(`📄 Pages retrieved: ${statusResult.data.length}`);
    } else if (statusResult?.status === 'failed') {
      console.log('❌ Crawl failed');
    } else {
      console.log('⚠️  Crawl still in progress, cancelling...');

      // Step 3: Cancel crawl
      console.log('\n📍 Step 3: Cancelling crawl job...');
      const cancelResult = await client.cancelCrawl(jobId);

      expect(cancelResult.status).toBe('cancelled');
      console.log(`✅ Crawl cancelled: ${cancelResult.status}`);
    }
  }, 90000); // 90 second timeout for full crawl lifecycle

  it('should start crawl with path filtering', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('⚠️  Skipping Firecrawl Crawl test - FIRECRAWL_API_KEY not set');
      return;
    }

    const client = new FirecrawlCrawlClient({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
    });

    console.log('\n🕷️  Testing Firecrawl Crawl - Path filtering');
    console.log('============================================================');

    const startResult = await client.startCrawl({
      url: 'https://firecrawl.dev',
      limit: 10,
      includePaths: ['docs/*'],
      excludePaths: ['blog/*'],
    });

    expect(startResult.success).toBe(true);
    expect(startResult.id).toBeDefined();

    console.log(`✅ Crawl with path filtering started: ${startResult.id}`);

    const jobId = startResult.id;

    // Type guard: Ensure jobId is defined before cancelling
    if (!jobId) {
      throw new Error('jobId is undefined after successful crawl start');
    }

    // Clean up by cancelling
    await client.cancelCrawl(jobId);
    console.log('✅ Test crawl cancelled');
  }, 30000);
});
