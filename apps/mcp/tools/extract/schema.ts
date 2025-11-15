import { z } from "zod";

/**
 * Schema for extract tool options
 */
export const extractOptionsSchema = z.object({
  urls: z
    .array(z.string().url())
    .min(1)
    .describe("URLs to extract structured data from"),

  prompt: z
    .string()
    .optional()
    .describe("Natural language prompt describing what data to extract"),

  schema: z
    .record(z.unknown())
    .optional()
    .describe("JSON schema defining the structure of data to extract"),

  scrapeOptions: z
    .object({
      formats: z.array(z.string()).optional(),
      onlyMainContent: z.boolean().optional(),
      includeTags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
      waitFor: z.number().optional(),
    })
    .optional()
    .describe("Options for scraping before extraction"),

  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Request timeout in milliseconds"),
});

export type ExtractOptions = z.infer<typeof extractOptionsSchema>;

/**
 * Build JSON schema for extract tool input
 */
export function buildExtractInputSchema() {
  return {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: { type: "string", format: "uri" },
        minItems: 1,
        description: "URLs to extract structured data from",
      },
      prompt: {
        type: "string",
        description: "Natural language prompt describing what data to extract",
      },
      schema: {
        type: "object",
        description: "JSON schema defining the structure of data to extract",
      },
      scrapeOptions: {
        type: "object",
        properties: {
          formats: { type: "array", items: { type: "string" } },
          onlyMainContent: { type: "boolean" },
          includeTags: { type: "array", items: { type: "string" } },
          excludeTags: { type: "array", items: { type: "string" } },
          waitFor: { type: "number" },
        },
        description: "Options for scraping before extraction",
      },
      timeout: {
        type: "number",
        description: "Request timeout in milliseconds",
      },
    },
    required: ["urls"],
  } as const;
}
