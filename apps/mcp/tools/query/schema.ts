import { z } from "zod";

/**
 * Search mode options for hybrid/semantic/keyword search
 */
const searchModeSchema = z.enum(["hybrid", "semantic", "keyword", "bm25"]);

/**
 * Search filters for domain/language/country/mobile
 */
const searchFiltersSchema = z
  .object({
    domain: z.string().optional().describe("Filter by domain"),
    language: z.string().optional().describe("Filter by language code"),
    country: z.string().optional().describe("Filter by country code"),
    isMobile: z.boolean().optional().describe("Filter by mobile flag"),
  })
  .optional();

/**
 * Query tool options schema
 */
export const queryOptionsSchema = z.object({
  query: z.string().min(1).describe("Search query text"),
  mode: searchModeSchema
    .default("hybrid")
    .describe(
      "Search mode: hybrid (vector + BM25), semantic (vector only), keyword/bm25 (keyword only)",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum number of results (1-100)"),
  filters: searchFiltersSchema.describe("Search filters"),
});

export type QueryOptions = z.infer<typeof queryOptionsSchema>;

/**
 * Build JSON schema for query tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues. Schemas imported from dist/ fail instanceof checks,
 * returning empty schemas.
 */
export function buildQueryInputSchema() {
  return {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        minLength: 1,
        description: "Search query text",
      },
      mode: {
        type: "string",
        enum: ["hybrid", "semantic", "keyword", "bm25"],
        default: "hybrid",
        description:
          "Search mode: hybrid (vector + BM25), semantic (vector only), keyword/bm25 (keyword only)",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 10,
        description: "Maximum number of results (1-100)",
      },
      filters: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description: "Filter by domain",
          },
          language: {
            type: "string",
            description: "Filter by language code",
          },
          country: {
            type: "string",
            description: "Filter by country code",
          },
          isMobile: {
            type: "boolean",
            description: "Filter by mobile flag",
          },
        },
        description: "Search filters",
      },
    },
    required: ["query"],
  };
}