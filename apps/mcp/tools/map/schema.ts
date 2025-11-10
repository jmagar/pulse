import { z } from 'zod';
import { env, parseNumber } from '../../config/environment.js';

// Read defaults from environment variables
// Reserved for future location filtering implementation
// const DEFAULT_COUNTRY = env.mapDefaultCountry || 'US';
// const DEFAULT_LANGUAGES = env.mapDefaultLanguages
//   ? env.mapDefaultLanguages.split(',').map((lang) => lang.trim())
//   : ['en-US'];
const DEFAULT_MAX_RESULTS = (() => {
  const envValue = env.mapMaxResultsPerPage;
  if (!envValue) return 200;

  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 5000) {
    console.warn(
      `Invalid MAP_MAX_RESULTS_PER_PAGE="${envValue}". Must be 1-5000. Using default: 200`
    );
    return 200;
  }
  return parsed;
})();

export const mapOptionsSchema = z.object({
  url: z.string().url('Valid URL is required'),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100000).optional().default(5000),
  sitemap: z.enum(['skip', 'include', 'only']).optional().default('include'),
  includeSubdomains: z.boolean().optional().default(true),
  ignoreQueryParameters: z.boolean().optional().default(true),
  timeout: z.number().int().positive().optional(),
  location: z
    .object({
      country: z.string().optional(),
      languages: z.array(z.string()).optional(),
    })
    .optional(),

  // Pagination parameters
  startIndex: z.number().int().min(0, 'startIndex must be non-negative').optional().default(0),
  maxResults: z
    .number()
    .int()
    .min(1, 'maxResults must be at least 1')
    .max(5000, 'maxResults cannot exceed 5000')
    .optional()
    .default(DEFAULT_MAX_RESULTS),

  // Result handling mode
  resultHandling: z
    .enum(['saveOnly', 'saveAndReturn', 'returnOnly'])
    .optional()
    .default('saveAndReturn'),
});

export type MapOptions = z.infer<typeof mapOptionsSchema>;

/**
 * Build JSON Schema for map tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues. Schemas imported from dist/ fail instanceof checks,
 * returning empty schemas.
 */
export const buildMapInputSchema = () => {
  return {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        format: 'uri',
        description: 'Base URL to discover links from',
      },
      search: {
        type: 'string',
        description: 'Optional search query to filter discovered URLs',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100000,
        default: 5000,
        description: 'Maximum total URLs to crawl (deprecated: use maxResults)',
      },
      sitemap: {
        type: 'string',
        enum: ['skip', 'include', 'only'],
        default: 'include',
        description:
          'How to handle sitemap URLs: skip (ignore sitemap), include (mix with crawled), only (sitemap only)',
      },
      includeSubdomains: {
        type: 'boolean',
        default: true,
        description: 'Include URLs from subdomains of the base domain',
      },
      ignoreQueryParameters: {
        type: 'boolean',
        default: true,
        description: 'Ignore URL query parameters when deduplicating',
      },
      timeout: {
        type: 'integer',
        minimum: 1,
        description: 'Request timeout in milliseconds',
      },
      location: {
        type: 'object',
        properties: {
          country: {
            type: 'string',
            description: 'Country code for localized results',
          },
          languages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Language codes for results',
          },
        },
        description: 'Location-based filtering options (optional)',
      },
      startIndex: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Starting index for pagination (0-based)',
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 5000,
        default: DEFAULT_MAX_RESULTS,
        description: 'Maximum URLs to return (1-5000, default 200 for ~13k tokens)',
      },
      resultHandling: {
        type: 'string',
        enum: ['saveOnly', 'saveAndReturn', 'returnOnly'],
        default: 'saveAndReturn',
        description:
          'How to handle results:\n' +
          '- saveOnly: Save as resource, return only link (token-efficient)\n' +
          '- saveAndReturn: Save and embed full content (default)\n' +
          '- returnOnly: Return inline without saving',
      },
    },
    required: ['url'],
  };
};
