import { z } from "zod";
import { browserActionsArraySchema } from "../scrape/action-types.js";
import { preprocessUrl } from "./url-utils.js";

const resolveCommand = (data: {
  command?: string;
  jobId?: string;
  cancel?: boolean;
  url?: string;
}) => {
  if (data.cancel) {
    return "cancel";
  }
  if (data.command && data.command !== "start") {
    return data.command;
  }
  if ((!data.url || data.url.length === 0) && data.jobId) {
    return "status";
  }
  return data.command ?? "start";
};

/**
 * Flattened schema for crawl tool that mirrors the CLI ergonomics:
 * - `crawl <url>`
 * - `crawl status <jobId>`
 * - `crawl cancel <jobId>`
 * - `crawl errors <jobId>`
 * - `crawl list`
 */
export const crawlOptionsSchema = z
  .object({
    command: z
      .enum(["start", "status", "cancel", "errors", "list"])
      .default("start"),
    url: z
      .string()
      .transform(preprocessUrl)
      .refine((val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      }, "Must be a valid URL")
      .optional(),
    jobId: z.string().min(1, "Job ID is required").optional(),
    /**
     * Legacy flag for backwards compatibility. When `true` we treat the
     * request as a cancel command even if `command` was omitted.
     */
    cancel: z.boolean().optional().default(false),
    webhook: z
      .object({
        url: z.string().url(),
        headers: z.record(z.string()).optional(),
        metadata: z.record(z.unknown()).optional(),
        events: z
          .array(z.enum(["completed", "page", "failed", "started"]))
          .optional(),
      })
      .optional()
      .describe("Webhook configuration for crawl events"),
    prompt: z
      .string()
      .optional()
      .describe(
        "Natural language prompt describing the crawl you want to perform. " +
          "Firecrawl will automatically generate optimal crawl parameters based on your description. " +
          "Examples: " +
          '"Find all blog posts about AI from the past year", ' +
          '"Crawl the documentation section and extract API endpoints", ' +
          '"Get all product pages with pricing information", ' +
          '"Map the entire site but exclude admin pages". ' +
          "When provided, this takes precedence over manual parameters.",
      ),
    limit: z.number().int().min(1).max(100000).optional().default(100),
    maxDiscoveryDepth: z.number().int().min(1).optional(),
    crawlEntireDomain: z.boolean().optional().default(false),
    allowSubdomains: z.boolean().optional().default(false),
    allowExternalLinks: z.boolean().optional().default(false),
    includePaths: z.array(z.string()).optional(),
    excludePaths: z.array(z.string()).optional(),
    ignoreQueryParameters: z.boolean().optional().default(true),
    sitemap: z.enum(["include", "skip"]).optional().default("include"),
    delay: z.number().int().min(0).optional(),
    maxConcurrency: z.number().int().min(1).optional(),
    scrapeOptions: z
      .object({
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
          .default(["markdown", "html"]),
        parsers: z
          .array(
            z.object({
              type: z.literal("pdf"),
              maxPages: z.number().int().min(1).max(10000).optional(),
            }),
          )
          .optional()
          .default([])
          .describe(
            "PDF parsing configuration. Default: [] (disabled). " +
              'Set to [{ type: "pdf" }] to enable PDF parsing (1 credit per page). ' +
              "Empty array prevents PDF engine from being used on HTML pages.",
          ),
        onlyMainContent: z.boolean().optional().default(true),
        includeTags: z.array(z.string()).optional(),
        excludeTags: z.array(z.string()).optional(),
        actions: browserActionsArraySchema
          .optional()
          .describe(
            "Browser actions to perform on each page before scraping. " +
              "Same action types as scrape tool: wait, click, write, press, scroll, screenshot, scrape, executeJavascript. " +
              "Applied to every page in the crawl.",
          ),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const command = resolveCommand(data);
    const needsUrl = command === "start";
    const needsJobId = ["status", "cancel", "errors"].includes(command);

    if (needsUrl && !data.url) {
      ctx.addIssue({
        code: "custom",
        message: 'Command "start" requires a "url" field',
      });
    }

    if (needsJobId && !data.jobId) {
      ctx.addIssue({
        code: "custom",
        message: `Command "${command}" requires a "jobId" field`,
      });
    }
  })
  .transform((data) => ({
    ...data,
    command: resolveCommand(data),
  }));

export type CrawlOptions = z.infer<typeof crawlOptionsSchema>;

export const buildCrawlInputSchema = () => {
  return {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        enum: ["start", "status", "cancel", "errors", "list"],
        default: "start",
        description:
          "crawl <url> | crawl status <jobId> | crawl cancel <jobId> | crawl errors <jobId> | crawl list",
      },
      url: {
        type: "string",
        format: "uri",
        description: "URL to start crawling from (start command)",
      },
      jobId: {
        type: "string",
        minLength: 1,
        description: "Crawl job ID (status/cancel/errors commands)",
      },
      cancel: {
        type: "boolean",
        default: false,
        description: "Deprecated flag. Prefer setting command=cancel.",
      },
      webhook: {
        type: "object",
        description: "Webhook configuration for crawl events",
        properties: {
          url: { type: "string", format: "uri" },
          headers: { type: "object", additionalProperties: { type: "string" } },
          metadata: { type: "object" },
          events: {
            type: "array",
            items: {
              type: "string",
              enum: ["completed", "page", "failed", "started"],
            },
          },
        },
        required: ["url"],
      },
      prompt: {
        type: "string",
        description:
          "Natural language prompt describing the crawl you want to perform. " +
          "Firecrawl will automatically generate optimal crawl parameters based on your description.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100000,
        default: 100,
        description: "Maximum pages to crawl (start command only)",
      },
      maxDiscoveryDepth: {
        type: "integer",
        minimum: 1,
        description: "Maximum depth to crawl based on discovery order",
      },
      crawlEntireDomain: {
        type: "boolean",
        default: false,
        description: "Crawl the entire domain (start command only)",
      },
      allowSubdomains: {
        type: "boolean",
        default: false,
        description: "Include URLs from subdomains of the base domain",
      },
      allowExternalLinks: {
        type: "boolean",
        default: false,
        description: "Allow following links to external domains",
      },
      includePaths: {
        type: "array",
        items: { type: "string" },
        description: "URL patterns to include in crawl (whitelist)",
      },
      excludePaths: {
        type: "array",
        items: { type: "string" },
        description: "URL patterns to exclude from crawl",
      },
      ignoreQueryParameters: {
        type: "boolean",
        default: true,
        description: "Ignore URL query parameters when determining uniqueness",
      },
      sitemap: {
        type: "string",
        enum: ["include", "skip"],
        default: "include",
        description: "How to handle sitemap URLs",
      },
      delay: {
        type: "integer",
        minimum: 0,
        description: "Delay in milliseconds between requests",
      },
      maxConcurrency: {
        type: "integer",
        minimum: 1,
        description: "Maximum number of concurrent requests",
      },
      scrapeOptions: {
        type: "object",
        properties: {
          formats: {
            type: "array",
            items: { type: "string" },
            default: ["markdown", "html"],
          },
          parsers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["pdf"] },
                maxPages: { type: "integer", minimum: 1, maximum: 10000 },
              },
            },
            default: [],
          },
          onlyMainContent: { type: "boolean", default: true },
          includeTags: { type: "array", items: { type: "string" } },
          excludeTags: { type: "array", items: { type: "string" } },
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
            description: "Browser actions to perform before scraping",
          },
        },
      },
    },
    required: [] as string[],
  } as const;
};
