/**
 * @fileoverview Zod schemas and input validation for the scrape tool
 *
 * This module provides schema definitions and validation logic for scraping
 * operations. It dynamically adjusts the schema based on available features
 * (like LLM extraction) and provides user-friendly parameter descriptions.
 *
 * @module shared/mcp/tools/scrape/schema
 */

import { z } from "zod";
import { browserActionsArraySchema } from "./action-types.js";
import { preprocessUrl } from "../../utils/url-validation.js";

/**
 * Parameter descriptions for scraping tool options
 *
 * Single source of truth for parameter documentation used in both
 * Zod schemas and MCP input schemas.
 */
export const PARAM_DESCRIPTIONS = {
  url: 'The webpage URL to scrape (e.g., "https://example.com/article", "https://api.example.com/docs")',
  urls: "List of URLs to scrape in a single batch request. When more than one URL is provided the tool uses Firecrawl batch scraping.",
  command:
    "Operation to perform: start (default), status, cancel, errors. Legacy inputs without command default to start.",
  jobId: "Batch scrape job identifier returned by the start command.",
  timeout:
    "Maximum time to wait for page load in milliseconds. Increase for slow-loading sites (e.g., 120000 for 2 minutes). Default: 60000 (1 minute)",
  maxChars:
    "Maximum number of characters to return from the scraped content. Useful for limiting response size. Default: 100000",
  startIndex:
    "Character position to start reading from. Use with maxChars for pagination through large documents (e.g., startIndex: 100000 to skip first 100k chars). Default: 0",
  resultHandling:
    'How to handle scraped content and MCP Resources. Options: "saveOnly" (saves as linked resource, no content returned), "saveAndReturn" (saves as embedded resource and returns content - default), "returnOnly" (returns content without saving). Default: "saveAndReturn"',
  forceRescrape:
    "Force a fresh scrape even if cached content exists for this URL. Useful when you know the content has changed. Default: false",
  cleanScrape:
    "Whether to clean the scraped content by converting HTML to semantic Markdown of what's on the page, removing ads, navigation, and boilerplate. This typically reduces content size by 50-90% while preserving main content. Only disable this for debugging or when you need the exact raw HTML structure. Default: true",
  maxAge:
    "Cache age threshold in milliseconds. Accept cached content if newer than this age. Set to 0 to always fetch fresh. Default: 172800000 (2 days). Firecrawl claims up to 500% faster responses with caching enabled.",
  proxy:
    'Proxy type for anti-bot bypass. Options: "basic" (fast, standard proxy), "stealth" (slow, 5 credits, advanced anti-bot bypass), "auto" (smart retry - tries basic first, falls back to stealth on failure). Default: "auto"',
  blockAds:
    "Enable ad-blocking and cookie popup blocking. Removes advertisements and cookie consent popups from scraped content for cleaner extraction. Default: true",
  headers:
    'Custom HTTP headers to send with the request. Useful for authentication, custom user agents, or cookies. Example: { "Cookie": "session=abc123", "User-Agent": "MyBot/1.0" }',
  waitFor:
    "Milliseconds to wait before scraping. Allows page JavaScript to fully load and execute. Useful for single-page applications (SPAs) that render content dynamically. Example: 3000 (wait 3 seconds)",
  includeTags:
    'HTML tags, classes, or IDs to include in scraped content. Whitelist filter for surgical content extraction. Examples: ["p", "h1", "h2"], [".article-body", "#main-content"], ["article", ".post"]',
  excludeTags:
    'HTML tags, classes, or IDs to exclude from scraped content. Blacklist filter to remove unwanted elements. Examples: ["#ad", ".sidebar", "nav"], [".advertisement", "aside"], ["script", "style"]',
  formats:
    'Output formats to extract from the page. Options: "markdown" (clean text), "html" (processed HTML), "rawHtml" (unprocessed), "links" (all hyperlinks), "images" (all image URLs), "screenshot" (page screenshot), "summary" (AI-generated summary), "branding" (brand colors/fonts), "changeTracking" (track content changes over time). Default: ["markdown", "html"]',
  parsers:
    'PDF parsing configuration. Default: [] (disabled). Set to [{ type: "pdf" }] to enable PDF parsing (1 credit per page). Empty array prevents PDF engine from being used on HTML pages.',
  onlyMainContent:
    "Extract only main content, excluding headers, navigation, footers, and ads. Uses intelligent content detection to identify the primary article/content area. Default: true",
  actions: `Browser automation actions to perform before scraping. Enables interaction with dynamic pages that require user input.

Action types and examples:

1. wait - Pause for content to load
   { type: "wait", milliseconds: 2000 }

2. click - Click buttons, links, or elements
   { type: "click", selector: "#load-more" }
   { type: "click", selector: ".cookie-accept" }

3. write - Type into input fields
   { type: "write", selector: "#search-input", text: "search query" }

4. press - Press keyboard keys
   { type: "press", key: "Enter" }
   { type: "press", key: "Escape" }

5. scroll - Scroll page to trigger lazy loading
   { type: "scroll", direction: "down" }
   { type: "scroll", direction: "up", amount: 500 }

6. screenshot - Capture page at specific point
   { type: "screenshot", name: "after-login" }

7. scrape - Scrape specific element
   { type: "scrape", selector: "#main-content" }

8. executeJavascript - Run custom JavaScript
   { type: "executeJavascript", script: "document.querySelector('.modal').remove()" }

Real-world example sequence:
[
  { type: "wait", milliseconds: 1000 },
  { type: "click", selector: "#cookie-accept" },
  { type: "write", selector: "#email", text: "user@example.com" },
  { type: "press", key: "Enter" },
  { type: "wait", milliseconds: 2000 },
  { type: "scrape", selector: "#dashboard" }
]`,
  extract: `Natural language query for intelligent content extraction. Describe what information you want extracted from the scraped page.

Examples:

Simple data extraction:
- "the author name and publication date"
- "all email addresses mentioned on the page"
- "the main product price and availability status"
- "company address and phone number"

Formatted extraction (specify desired format):
- "summarize the main article in 3 bullet points"
- "extract the recipe ingredients as a markdown list"
- "get the pricing tiers as a comparison table in markdown"
- "extract all testimonials with customer names and quotes formatted as markdown blockquotes"

Structured data extraction (request specific output format):
- "extract product details as JSON with fields: name, price, description, specifications"
- "get all job listings as JSON array with title, location, salary, and requirements"
- "extract the FAQ section as JSON with question and answer pairs"
- "parse the contact information into JSON format with fields for address, phone, email, and hours"

Complex queries:
- "analyze the sentiment of customer reviews and categorize them as positive, negative, or neutral"
- "extract and summarize the key features of the product, highlighting unique selling points"
- "identify all dates mentioned and what events they relate to"
- "extract technical specifications and explain them in simple terms"

The LLM will intelligently parse the page content and return only the requested information in a clear, readable format.`,
} as const;

const SCRAPE_COMMANDS = ["start", "status", "cancel", "errors"] as const;
type ScrapeCommand = (typeof SCRAPE_COMMANDS)[number];

const resolveScrapeCommand = (data: {
  command?: ScrapeCommand;
  cancel?: boolean;
  jobId?: string;
}): ScrapeCommand => {
  if (data.cancel) {
    return "cancel";
  }
  if (data.command && data.command !== "start") {
    return data.command;
  }
  if (!data.command && data.jobId) {
    return "status";
  }
  return data.command ?? "start";
};

/**
 * Build Zod validation schema for scrape tool arguments
 *
 * Creates a Zod schema that validates scraping parameters. The extract
 * parameter is always available - the webhook service validates LLM
 * availability and returns appropriate errors if extraction is unavailable.
 *
 * @returns Zod schema for validating scrape arguments
 *
 * @example
 * ```typescript
 * const schema = buildScrapeArgsSchema();
 * const validated = schema.parse({
 *   url: 'example.com', // Will be normalized to https://example.com
 *   timeout: 30000,
 *   extract: 'the main article text'
 * });
 * ```
 */
export const buildScrapeArgsSchema = () => {
  const baseSchema = {
    command: z
      .enum(SCRAPE_COMMANDS)
      .optional()
      .describe(PARAM_DESCRIPTIONS.command),
    cancel: z.boolean().optional().default(false),
    jobId: z.string().min(1).optional().describe(PARAM_DESCRIPTIONS.jobId),
    url: z
      .string()
      .transform(preprocessUrl)
      .pipe(z.string().url())
      .optional()
      .describe(PARAM_DESCRIPTIONS.url),
    urls: z
      .array(z.string().transform(preprocessUrl).pipe(z.string().url()))
      .min(1)
      .optional()
      .describe(PARAM_DESCRIPTIONS.urls),
    timeout: z
      .number()
      .optional()
      .default(60000)
      .describe(PARAM_DESCRIPTIONS.timeout),
    maxChars: z
      .number()
      .optional()
      .default(100000)
      .describe(PARAM_DESCRIPTIONS.maxChars),
    startIndex: z
      .number()
      .optional()
      .default(0)
      .describe(PARAM_DESCRIPTIONS.startIndex),
    resultHandling: z
      .enum(["saveOnly", "saveAndReturn", "returnOnly"])
      .optional()
      .default("saveAndReturn")
      .describe(PARAM_DESCRIPTIONS.resultHandling),
    forceRescrape: z
      .boolean()
      .optional()
      .default(false)
      .describe(PARAM_DESCRIPTIONS.forceRescrape),
    cleanScrape: z
      .boolean()
      .optional()
      .default(true)
      .describe(PARAM_DESCRIPTIONS.cleanScrape),
    maxAge: z
      .number()
      .optional()
      .default(172800000)
      .describe(PARAM_DESCRIPTIONS.maxAge),
    proxy: z
      .enum(["basic", "stealth", "auto"])
      .optional()
      .default("auto")
      .describe(PARAM_DESCRIPTIONS.proxy),
    blockAds: z
      .boolean()
      .optional()
      .default(true)
      .describe(PARAM_DESCRIPTIONS.blockAds),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe(PARAM_DESCRIPTIONS.headers),
    waitFor: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(PARAM_DESCRIPTIONS.waitFor),
    includeTags: z
      .array(z.string())
      .optional()
      .describe(PARAM_DESCRIPTIONS.includeTags),
    excludeTags: z
      .array(z.string())
      .optional()
      .describe(PARAM_DESCRIPTIONS.excludeTags),
    formats: z
      .array(
        z.enum([
          "markdown",
          "html",
          "rawHtml",
          "links",
          "images",
          "screenshot",
          "summary",
          "branding",
          "changeTracking",
        ]),
      )
      .optional()
      .default(["markdown", "html"])
      .describe(PARAM_DESCRIPTIONS.formats),
    parsers: z
      .array(
        z.object({
          type: z.literal("pdf"),
          maxPages: z.number().int().min(1).max(10000).optional(),
        }),
      )
      .optional()
      .default([])
      .describe(PARAM_DESCRIPTIONS.parsers),
    onlyMainContent: z
      .boolean()
      .optional()
      .default(true)
      .describe(PARAM_DESCRIPTIONS.onlyMainContent),
    actions: browserActionsArraySchema
      .optional()
      .describe(PARAM_DESCRIPTIONS.actions),
    extract: z.string().optional().describe(PARAM_DESCRIPTIONS.extract),
  };

  return z
    .object(baseSchema)
    .superRefine((data, ctx) => {
      const command = resolveScrapeCommand(data);
      const hasUrl = Boolean(data.url) || Boolean(data.urls?.length);

      if (command === "start" && !hasUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Provide at least one "url" or an "urls" array to start a scrape',
        });
      }

      if (command !== "start" && !data.jobId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Command "${command}" requires a jobId argument`,
        });
      }
    })
    .transform((data) => {
      const command = resolveScrapeCommand(data);
      const urls = data.urls ?? (data.url ? [data.url] : undefined);
      const primaryUrl = data.url ?? urls?.[0];
      const { cancel: _cancel, ...rest } = data;

      return {
        ...rest,
        command,
        url: primaryUrl,
        urls,
      };
    });
};

/**
 * Build MCP-compatible input schema for scrape tool
 *
 * Creates a JSON Schema compatible with the MCP protocol for tool registration.
 * The extract parameter is always available - the webhook service validates LLM
 * availability and returns appropriate errors if extraction is unavailable.
 *
 * @returns MCP input schema object with properties and required fields
 *
 * @example
 * ```typescript
 * const schema = buildInputSchema();
 * // Use in MCP tool registration
 * server.setRequestHandler(CallToolRequestSchema, async (request) => {
 *   // Schema is used for validation and documentation
 * });
 * ```
 */
export const buildInputSchema = () => {
  const baseProperties = {
    command: {
      type: "string",
      enum: SCRAPE_COMMANDS,
      default: "start",
      description: PARAM_DESCRIPTIONS.command,
    },
    cancel: {
      type: "boolean",
      default: false,
      description: 'Deprecated flag. Prefer setting command="cancel".',
    },
    jobId: {
      type: "string",
      description: PARAM_DESCRIPTIONS.jobId,
    },
    url: {
      type: "string",
      format: "uri",
      description: PARAM_DESCRIPTIONS.url,
    },
    urls: {
      type: "array",
      items: { type: "string", format: "uri" },
      description: PARAM_DESCRIPTIONS.urls,
    },
    timeout: {
      type: "number",
      default: 60000,
      description: PARAM_DESCRIPTIONS.timeout,
    },
    maxChars: {
      type: "number",
      default: 100000,
      description: PARAM_DESCRIPTIONS.maxChars,
    },
    startIndex: {
      type: "number",
      default: 0,
      description: PARAM_DESCRIPTIONS.startIndex,
    },
    resultHandling: {
      type: "string",
      enum: ["saveOnly", "saveAndReturn", "returnOnly"],
      default: "saveAndReturn",
      description: PARAM_DESCRIPTIONS.resultHandling,
    },
    forceRescrape: {
      type: "boolean",
      default: false,
      description: PARAM_DESCRIPTIONS.forceRescrape,
    },
    cleanScrape: {
      type: "boolean",
      default: true,
      description: PARAM_DESCRIPTIONS.cleanScrape,
    },
    maxAge: {
      type: "number",
      default: 172800000,
      description: PARAM_DESCRIPTIONS.maxAge,
    },
    proxy: {
      type: "string",
      enum: ["basic", "stealth", "auto"],
      default: "auto",
      description: PARAM_DESCRIPTIONS.proxy,
    },
    blockAds: {
      type: "boolean",
      default: true,
      description: PARAM_DESCRIPTIONS.blockAds,
    },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
      description: PARAM_DESCRIPTIONS.headers,
    },
    waitFor: {
      type: "number",
      description: PARAM_DESCRIPTIONS.waitFor,
    },
    includeTags: {
      type: "array",
      items: { type: "string" },
      description: PARAM_DESCRIPTIONS.includeTags,
    },
    excludeTags: {
      type: "array",
      items: { type: "string" },
      description: PARAM_DESCRIPTIONS.excludeTags,
    },
    formats: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "markdown",
          "html",
          "rawHtml",
          "links",
          "images",
          "screenshot",
          "summary",
          "branding",
          "changeTracking",
        ],
      },
      default: ["markdown", "html"],
      description: PARAM_DESCRIPTIONS.formats,
    },
    parsers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["pdf"] },
          maxPages: { type: "integer", minimum: 1, maximum: 10000 },
        },
        required: ["type"],
      },
      default: [],
      description: PARAM_DESCRIPTIONS.parsers,
    },
    onlyMainContent: {
      type: "boolean",
      default: true,
      description: PARAM_DESCRIPTIONS.onlyMainContent,
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        oneOf: [
          {
            type: "object",
            required: ["type", "milliseconds"],
            properties: {
              type: { type: "string", enum: ["wait"] },
              milliseconds: {
                type: "number",
                description: "Time to wait in milliseconds",
              },
            },
          },
          {
            type: "object",
            required: ["type", "selector"],
            properties: {
              type: { type: "string", enum: ["click"] },
              selector: {
                type: "string",
                description: "CSS selector of element to click",
              },
            },
          },
          {
            type: "object",
            required: ["type", "selector", "text"],
            properties: {
              type: { type: "string", enum: ["write"] },
              selector: {
                type: "string",
                description: "CSS selector of input field",
              },
              text: { type: "string", description: "Text to type" },
            },
          },
          {
            type: "object",
            required: ["type", "key"],
            properties: {
              type: { type: "string", enum: ["press"] },
              key: {
                type: "string",
                description: 'Key to press (e.g., "Enter")',
              },
            },
          },
          {
            type: "object",
            required: ["type", "direction"],
            properties: {
              type: { type: "string", enum: ["scroll"] },
              direction: { type: "string", enum: ["up", "down"] },
              amount: {
                type: "number",
                description: "Pixels to scroll (optional)",
              },
            },
          },
          {
            type: "object",
            required: ["type"],
            properties: {
              type: { type: "string", enum: ["screenshot"] },
              name: {
                type: "string",
                description: "Screenshot name (optional)",
              },
            },
          },
          {
            type: "object",
            required: ["type"],
            properties: {
              type: { type: "string", enum: ["scrape"] },
              selector: {
                type: "string",
                description: "CSS selector (optional)",
              },
            },
          },
          {
            type: "object",
            required: ["type", "script"],
            properties: {
              type: { type: "string", enum: ["executeJavascript"] },
              script: {
                type: "string",
                description: "JavaScript code to execute",
              },
            },
          },
        ],
      },
      description: PARAM_DESCRIPTIONS.actions,
    },
    extract: {
      type: "string",
      description: PARAM_DESCRIPTIONS.extract,
    },
  };

  return {
    type: "object" as const,
    properties: baseProperties,
    required: [],
  };
};
