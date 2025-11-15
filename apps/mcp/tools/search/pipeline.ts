import type {
  SearchOptions as ClientSearchOptions,
  SearchResult,
} from "@firecrawl/client";
import type { SearchOptions } from "./schema.js";

export async function searchPipeline(
  client: { search: (options: ClientSearchOptions) => Promise<SearchResult> },
  options: SearchOptions,
): Promise<SearchResult> {
  const clientOptions: ClientSearchOptions = {
    query: options.query,
    limit: options.limit,
    sources: options.sources,
    categories: options.categories,
    country: options.country,
    lang: options.lang,
    location: options.location,
    timeout: options.timeout,
    ignoreInvalidURLs: options.ignoreInvalidURLs,
    tbs: options.tbs,
    scrapeOptions: options.scrapeOptions,
  };

  return await client.search(clientOptions);
}
