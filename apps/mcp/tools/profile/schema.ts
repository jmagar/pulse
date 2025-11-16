import { z } from "zod";

/**
 * Parameter descriptions for profile tool
 */
export const PARAM_DESCRIPTIONS = {
  crawl_id: "Firecrawl crawl/job identifier returned by the crawl tool",
  include_details:
    "Include per-page operation breakdowns and detailed performance metrics. " +
    "Use this to see which specific pages were slow or failed. Default: false",
  error_offset:
    "Error pagination offset (0-based). Use to page through errors when total " +
    "exceeds error_limit. Default: 0",
  error_limit: "Maximum number of errors to return per page (1-50). Default: 5",
};

/**
 * Profile tool options schema
 */
export const profileOptionsSchema = z.object({
  crawl_id: z.string().min(1).describe(PARAM_DESCRIPTIONS.crawl_id),
  include_details: z
    .boolean()
    .optional()
    .default(false)
    .describe(PARAM_DESCRIPTIONS.include_details),
  error_offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(PARAM_DESCRIPTIONS.error_offset),
  error_limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(5)
    .describe(PARAM_DESCRIPTIONS.error_limit),
});

export type ProfileOptions = z.infer<typeof profileOptionsSchema>;

/**
 * Build JSON schema for profile tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues (same pattern as query tool).
 */
export function buildProfileInputSchema() {
  return {
    type: "object" as const,
    properties: {
      crawl_id: {
        type: "string",
        minLength: 1,
        description: PARAM_DESCRIPTIONS.crawl_id,
      },
      include_details: {
        type: "boolean",
        default: false,
        description: PARAM_DESCRIPTIONS.include_details,
      },
      error_offset: {
        type: "integer",
        minimum: 0,
        default: 0,
        description: PARAM_DESCRIPTIONS.error_offset,
      },
      error_limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 5,
        description: PARAM_DESCRIPTIONS.error_limit,
      },
    },
    required: ["crawl_id"],
  };
}
