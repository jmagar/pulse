import { z } from 'zod';

export const searchOptionsSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().int().min(1).max(100).optional().default(5),
  sources: z.array(z.enum(['web', 'images', 'news'])).optional(),
  categories: z.array(z.enum(['github', 'research', 'pdf'])).optional(),
  country: z.string().optional(),
  lang: z.string().optional().default('en'),
  location: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  ignoreInvalidURLs: z.boolean().optional().default(false),
  tbs: z
    .string()
    .optional()
    .describe(
      'Time-based search filter. Filters results by date range. ' +
        'Valid values: ' +
        'qdr:h (past hour), qdr:d (past day), qdr:w (past week), qdr:m (past month), qdr:y (past year), ' +
        'or custom range: cdr:a,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY. ' +
        'Examples: "qdr:d" (past 24 hours), "qdr:w" (past week), "cdr:a,cd_min:01/01/2024,cd_max:12/31/2024" (custom range)'
    ),
  scrapeOptions: z
    .object({
      formats: z.array(z.string()).optional(),
      onlyMainContent: z.boolean().optional(),
      removeBase64Images: z.boolean().optional().default(true),
      blockAds: z.boolean().optional().default(true),
      waitFor: z.number().int().optional(),
      parsers: z.array(z.string()).optional(),
    })
    .optional(),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;

/**
 * Build JSON Schema for search tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues. Schemas imported from dist/ fail instanceof checks,
 * returning empty schemas.
 */
export const buildSearchInputSchema = () => {
  return {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        description: 'Search query (required)',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 5,
        description: 'Maximum number of results to return per source',
      },
      sources: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['web', 'images', 'news'],
        },
        description: 'Which search sources to query (web, images, news)',
      },
      categories: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['github', 'research', 'pdf'],
        },
        description: 'Filter results by category (GitHub repos, research papers, PDFs)',
      },
      country: {
        type: 'string',
        description: 'Country code for localized results (e.g., "us", "gb")',
      },
      lang: {
        type: 'string',
        default: 'en',
        description: 'Language code for results (e.g., "en", "es")',
      },
      location: {
        type: 'string',
        description: 'Geographic location for localized results',
      },
      timeout: {
        type: 'integer',
        minimum: 1,
        description: 'Request timeout in milliseconds',
      },
      ignoreInvalidURLs: {
        type: 'boolean',
        default: false,
        description: 'Skip results with invalid URLs',
      },
      tbs: {
        type: 'string',
        description:
          'Time-based search filter. Filters results by date range. ' +
          'Valid values: ' +
          'qdr:h (past hour), qdr:d (past day), qdr:w (past week), qdr:m (past month), qdr:y (past year), ' +
          'or custom range: cdr:a,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY. ' +
          'Examples: "qdr:d" (past 24 hours), "qdr:w" (past week), "cdr:a,cd_min:01/01/2024,cd_max:12/31/2024" (custom range)',
      },
      scrapeOptions: {
        type: 'object',
        properties: {
          formats: {
            type: 'array',
            items: { type: 'string' },
            description: 'Content formats to extract (markdown, html, etc.)',
          },
          onlyMainContent: {
            type: 'boolean',
            description: 'Extract only main content, excluding nav/ads',
          },
          removeBase64Images: {
            type: 'boolean',
            default: true,
            description: 'Remove base64-encoded images from output',
          },
          blockAds: {
            type: 'boolean',
            default: true,
            description: 'Block advertisements and trackers',
          },
          waitFor: {
            type: 'integer',
            description: 'Milliseconds to wait for page load',
          },
          parsers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Custom parsers to apply',
          },
        },
        description: 'Options for scraping search result pages',
      },
    },
    required: ['query'],
  };
};
