import type {
  FirecrawlMapClient,
  MapOptions as ClientMapOptions,
  MapResult,
} from '@firecrawl/client';
import type { MapOptions } from './schema.js';
import { logDebug } from '../../utils/logging.js';

export async function mapPipeline(
  client: FirecrawlMapClient,
  options: MapOptions
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

  logDebug('map-pipeline', 'Map pipeline options', { options: clientOptions });
  const result = await client.map(clientOptions);
  logDebug('map-pipeline', 'Map pipeline result', {
    success: result.success,
    linksCount: result.links?.length || 0,
  });
  return result;
}
