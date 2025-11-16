import type { ExtractOptions } from "./schema.js";

// Define extract types inline (Firecrawl SDK may not have these yet)
export interface ExtractResult {
  success: boolean;
  data?: Array<Record<string, unknown>>;
  error?: string;
}

interface ClientExtractOptions {
  urls: string[];
  prompt?: string;
  schema?: Record<string, unknown>;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
    includeTags?: string[];
    excludeTags?: string[];
    waitFor?: number;
  };
  timeout?: number;
}

/**
 * Execute extract operation using Firecrawl client
 */
export async function extractPipeline(
  client: {
    extract: (options: ClientExtractOptions) => Promise<ExtractResult>;
  },
  options: ExtractOptions,
): Promise<ExtractResult> {
  const clientOptions: ClientExtractOptions = {
    urls: options.urls,
    prompt: options.prompt,
    schema: options.schema,
    timeout: options.timeout,
  };

  // Add scrapeOptions if provided
  if (options.scrapeOptions) {
    clientOptions.scrapeOptions = options.scrapeOptions;
  }

  console.log(
    "[DEBUG] Extract pipeline options:",
    JSON.stringify(
      { ...clientOptions, schema: clientOptions.schema ? "provided" : "none" },
      null,
      2,
    ),
  );

  const result = await client.extract(clientOptions);

  console.log(
    "[DEBUG] Extract pipeline result:",
    JSON.stringify(
      {
        success: result.success,
        dataCount: result.data?.length || 0,
      },
      null,
      2,
    ),
  );

  return result;
}
