import { z } from 'zod';
import { browserActionsArraySchema } from '../scrape/action-types.js';

/**
 * Flattened schema for crawl tool
 *
 * Supports two operation modes:
 * 1. Start a new crawl: Provide `url` (jobId must be absent)
 * 2. Check status or cancel: Provide `jobId` (url must be absent)
 *
 * Note: Both url and jobId are optional in the schema to avoid anyOf/oneOf
 * at the root level (which Anthropic's API doesn't support). The handler
 * validates that exactly one is provided.
 */
export const crawlOptionsSchema = z
  .object({
    // Required for starting a new crawl (mutually exclusive with jobId)
    url: z.string().url('Valid URL is required').optional(),

    // Required for checking status or canceling (mutually exclusive with url)
    jobId: z.string().min(1, 'Job ID is required').optional(),

    // Operation flag for jobId mode
    cancel: z.boolean().optional().default(false),

    // Natural language prompt for Firecrawl to generate optimal crawl parameters
    prompt: z
      .string()
      .optional()
      .describe(
        'Natural language prompt describing the crawl you want to perform. ' +
          'Firecrawl will automatically generate optimal crawl parameters based on your description. ' +
          'Examples: ' +
          '"Find all blog posts about AI from the past year", ' +
          '"Crawl the documentation section and extract API endpoints", ' +
          '"Get all product pages with pricing information", ' +
          '"Map the entire site but exclude admin pages". ' +
          'When provided, this takes precedence over manual parameters.'
      ),

    // Crawl configuration options (only used with url)
    limit: z.number().int().min(1).max(100000).optional().default(100),
    maxDiscoveryDepth: z.number().int().min(1).optional(),
    crawlEntireDomain: z.boolean().optional().default(false),
    allowSubdomains: z.boolean().optional().default(false),
    allowExternalLinks: z.boolean().optional().default(false),
    includePaths: z.array(z.string()).optional(),
    excludePaths: z.array(z.string()).optional(),
    ignoreQueryParameters: z.boolean().optional().default(true),
    sitemap: z.enum(['include', 'skip']).optional().default('include'),
    delay: z.number().int().min(0).optional(),
    maxConcurrency: z.number().int().min(1).optional(),
    scrapeOptions: z
      .object({
        formats: z
          .array(
            z.enum([
              'markdown',
              'html',
              'rawHtml',
              'links',
              'images',
              'screenshot',
              'summary',
              'branding',
              'changeTracking',
            ])
          )
          .optional()
          .default(['markdown', 'html']),
        parsers: z
          .array(
            z.object({
              type: z.literal('pdf'),
              maxPages: z.number().int().min(1).max(10000).optional(),
            })
          )
          .optional()
          .default([])
          .describe(
            'PDF parsing configuration. Default: [] (disabled). ' +
              'Set to [{ type: "pdf" }] to enable PDF parsing (1 credit per page). ' +
              'Empty array prevents PDF engine from being used on HTML pages.'
          ),
        onlyMainContent: z.boolean().optional().default(true),
        includeTags: z.array(z.string()).optional(),
        excludeTags: z.array(z.string()).optional(),
        actions: browserActionsArraySchema
          .optional()
          .describe(
            'Browser actions to perform on each page before scraping. ' +
              'Same action types as scrape tool: wait, click, write, press, scroll, screenshot, scrape, executeJavascript. ' +
              'Applied to every page in the crawl.'
          ),
      })
      .optional(),
  })
  // Note: When 'prompt' is provided, Firecrawl API will use it to generate
  // optimal parameters. Manual parameters may be overridden by the AI-generated configuration.
  .refine(
    (data) => {
      // Exactly one of url or jobId must be provided
      const hasUrl = !!data.url;
      const hasJobId = !!data.jobId;
      return hasUrl !== hasJobId; // XOR: one must be true, the other false
    },
    {
      message: 'Provide either "url" to start a crawl, or "jobId" to check status/cancel',
    }
  );

export type CrawlOptions = z.infer<typeof crawlOptionsSchema>;

/**
 * Build JSON Schema for crawl tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues. Schemas imported from dist/ fail instanceof checks,
 * returning empty schemas.
 */
export const buildCrawlInputSchema = () => {
  return {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        format: 'uri',
        description: 'URL to start crawling from (for starting new crawl)',
      },
      jobId: {
        type: 'string',
        minLength: 1,
        description: 'Crawl job ID (for checking status or canceling)',
      },
      cancel: {
        type: 'boolean',
        default: false,
        description: 'Set to true with jobId to cancel a running crawl',
      },
      prompt: {
        type: 'string',
        description:
          'Natural language prompt describing the crawl you want to perform. ' +
          'Firecrawl will automatically generate optimal crawl parameters based on your description. ' +
          'Examples: ' +
          '"Find all blog posts about AI from the past year", ' +
          '"Crawl the documentation section and extract API endpoints", ' +
          '"Get all product pages with pricing information", ' +
          '"Map the entire site but exclude admin pages". ' +
          'When provided, this takes precedence over manual parameters.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100000,
        default: 100,
        description: 'Maximum pages to crawl (1-100000, default 100)',
      },
      maxDiscoveryDepth: {
        type: 'integer',
        minimum: 1,
        description:
          'Maximum depth to crawl based on discovery order. ' +
          'The root site and sitemapped pages have a discovery depth of 0. ' +
          'For example, if set to 1 with sitemap: "skip", only the entered URL and directly linked pages will be crawled.',
      },
      crawlEntireDomain: {
        type: 'boolean',
        default: false,
        description: 'Crawl the entire domain (not just the starting path)',
      },
      allowSubdomains: {
        type: 'boolean',
        default: false,
        description: 'Include URLs from subdomains of the base domain',
      },
      allowExternalLinks: {
        type: 'boolean',
        default: false,
        description: 'Allow following links to external domains',
      },
      includePaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'URL patterns to include in crawl (whitelist)',
      },
      excludePaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'URL patterns to exclude from crawl',
      },
      ignoreQueryParameters: {
        type: 'boolean',
        default: true,
        description: 'Ignore URL query parameters when determining uniqueness',
      },
      sitemap: {
        type: 'string',
        enum: ['include', 'skip'],
        default: 'include',
        description: 'How to handle sitemap URLs: include or skip',
      },
      delay: {
        type: 'integer',
        minimum: 0,
        description: 'Delay in milliseconds between requests',
      },
      maxConcurrency: {
        type: 'integer',
        minimum: 1,
        description: 'Maximum number of concurrent requests',
      },
      scrapeOptions: {
        type: 'object',
        properties: {
          formats: {
            type: 'array',
            items: { type: 'string' },
            default: ['markdown', 'html'],
            description: 'Content formats to extract (markdown, html, etc.)',
          },
          parsers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['pdf'] },
                maxPages: { type: 'integer', minimum: 1, maximum: 10000 },
              },
              required: ['type'],
            },
            default: [],
            description:
              'PDF parsing configuration. Default: [] (disabled). ' +
              'Set to [{ type: "pdf" }] to enable PDF parsing (1 credit per page). ' +
              'Empty array prevents PDF engine from being used on HTML pages.',
          },
          onlyMainContent: {
            type: 'boolean',
            default: true,
            description: 'Extract only main content, excluding nav/ads',
          },
          includeTags: {
            type: 'array',
            items: { type: 'string' },
            description: 'HTML tags to include in extraction',
          },
          excludeTags: {
            type: 'array',
            items: { type: 'string' },
            description: 'HTML tags to exclude from extraction',
          },
          actions: {
            type: 'array',
            items: { type: 'object' },
            description:
              'Browser actions to perform on each page before scraping. ' +
              'Same action types as scrape tool: wait, click, write, press, scroll, screenshot, scrape, executeJavascript. ' +
              'Applied to every page in the crawl.',
          },
        },
        description: 'Options for scraping crawled pages',
      },
    },
    // Note: url and jobId are mutually exclusive, but JSON Schema
    // can't express XOR at root level for Anthropic API compatibility.
    // Validation happens in Zod schema via .refine()
  };
};
