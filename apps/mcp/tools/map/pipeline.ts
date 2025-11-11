import type {
  FirecrawlMapClient,
  MapOptions as ClientMapOptions,
  MapResult,
} from "@firecrawl/client";
import type { MapOptions } from "./schema.js";

export async function mapPipeline(
  client: FirecrawlMapClient,
  options: MapOptions,
): Promise<MapResult> {
  const clientOptions: ClientMapOptions = {
    url: options.url,
    search: options.search,
    limit: options.limit,
    sitemap: options.sitemap,
    includeSubdomains: options.includeSubdomains,
    ignoreQueryParameters: options.ignoreQueryParameters,
    timeout: options.timeout,
    location: options.location,
  };

  console.log(
    "[DEBUG] Map pipeline options:",
    JSON.stringify(clientOptions, null, 2),
  );
  const result = await client.map(clientOptions);
  console.log(
    "[DEBUG] Map pipeline result:",
    JSON.stringify(
      { success: result.success, linksCount: result.links?.length || 0 },
      null,
      2,
    ),
  );
  return result;
}
