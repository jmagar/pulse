import type {
  FirecrawlCrawlClient,
  CrawlOptions as ClientCrawlOptions,
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
  CrawlErrorsResult,
  ActiveCrawlsResult,
} from "@firecrawl/client";
import type { CrawlOptions } from "./schema.js";
import {
  mergeExcludePaths,
  mergeScrapeOptions,
} from "../../config/crawl-config.js";

export async function crawlPipeline(
  client: FirecrawlCrawlClient,
  options: CrawlOptions,
): Promise<
  | StartCrawlResult
  | CrawlStatusResult
  | CancelResult
  | CrawlErrorsResult
  | ActiveCrawlsResult
> {
  const command = options.command;

  if (command === "start") {
    if (!options.url) {
      throw new Error('Command "start" requires a url');
    }

    const mergedScrapeOptions = mergeScrapeOptions(options.scrapeOptions);

    // Apply default webhook event filtering if webhook is configured
    let webhookConfig = options.webhook;
    if (webhookConfig && !webhookConfig.events) {
      webhookConfig = {
        ...webhookConfig,
        events: ["page"], // Default to page-only events
      };
    }

    const clientOptions: ClientCrawlOptions = {
      url: options.url,
      prompt: options.prompt,
      limit: options.limit,
      maxDiscoveryDepth: options.maxDiscoveryDepth,
      crawlEntireDomain: options.crawlEntireDomain ?? false,
      allowSubdomains: options.allowSubdomains,
      allowExternalLinks: options.allowExternalLinks,
      includePaths: options.includePaths,
      excludePaths: mergeExcludePaths(options.excludePaths),
      ignoreQueryParameters: options.ignoreQueryParameters,
      sitemap: options.sitemap,
      delay: options.delay,
      maxConcurrency: options.maxConcurrency,
      webhook: webhookConfig,
      scrapeOptions: {
        ...mergedScrapeOptions,
        parsers: mergedScrapeOptions.parsers ?? [],
      },
    };

    return client.startCrawl(clientOptions);
  }

  if (
    ["status", "cancel", "errors"].includes(command ?? "") &&
    !options.jobId
  ) {
    throw new Error(`Command "${command}" requires a jobId`);
  }

  switch (command) {
    case "status":
      return client.getCrawlStatus(options.jobId!);
    case "cancel":
      return client.cancelCrawl(options.jobId!);
    case "errors":
      return client.getCrawlErrors(options.jobId!);
    case "list":
      return client.listActiveCrawls();
    default:
      throw new Error(`Unsupported crawl command: ${command}`);
  }
}
