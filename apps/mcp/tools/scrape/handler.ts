/**
 * @fileoverview Scrape tool handler - Thin wrapper calling webhook service
 *
 * This handler delegates all scraping operations to the webhook service's
 * /api/v2/scrape endpoint. The MCP server maintains schema validation
 * and response formatting but no longer contains business logic.
 *
 * @module tools/scrape/handler
 */
import { z } from "zod";
import { buildScrapeArgsSchema } from "./schema.js";
import { WebhookScrapeClient } from "./webhook-client.js";
import type { ToolResponse } from "./response.js";
import { buildWebhookResponse } from "./response.js";
import { env } from "../../config/environment.js";
import { logDebug } from "../../utils/logging.js";

/**
 * Handle scrape tool request
 *
 * Validates input schema and delegates to webhook service for processing.
 * All caching, cleaning, extraction, and storage handled server-side.
 *
 * @param args - User-provided arguments (unvalidated)
 * @returns MCP tool response with content or error
 */
export async function handleScrapeRequest(
  args: unknown,
): Promise<ToolResponse> {
  try {
    // Validate arguments
    const ScrapeArgsSchema = buildScrapeArgsSchema();
    const validatedArgs = ScrapeArgsSchema.parse(args);

    logDebug("handleScrapeRequest", "Validated args", {
      command: validatedArgs.command,
      hasUrl: !!validatedArgs.url,
      hasUrls: !!validatedArgs.urls,
      jobId: validatedArgs.jobId,
    });

    // Get webhook configuration
    const webhookBaseUrl = env.webhookBaseUrl;
    const webhookApiSecret = env.webhookApiSecret;

    if (!webhookBaseUrl || !webhookApiSecret) {
      return {
        content: [
          {
            type: "text",
            text: "Webhook service not configured. Set MCP_WEBHOOK_BASE_URL and MCP_WEBHOOK_API_SECRET environment variables.",
          },
        ],
        isError: true,
      };
    }

    // Create webhook client
    const client = new WebhookScrapeClient({
      baseUrl: webhookBaseUrl,
      apiSecret: webhookApiSecret,
    });

    // Build webhook request from validated args
    const webhookRequest = {
      command: validatedArgs.command || "start",
      url: validatedArgs.url,
      urls: validatedArgs.urls,
      jobId: validatedArgs.jobId,
      timeout: validatedArgs.timeout,
      maxChars: validatedArgs.maxChars,
      startIndex: validatedArgs.startIndex,
      resultHandling: validatedArgs.resultHandling,
      forceRescrape: validatedArgs.forceRescrape,
      cleanScrape: validatedArgs.cleanScrape,
      maxAge: validatedArgs.maxAge,
      proxy: validatedArgs.proxy,
      blockAds: validatedArgs.blockAds,
      headers: validatedArgs.headers,
      waitFor: validatedArgs.waitFor,
      includeTags: validatedArgs.includeTags,
      excludeTags: validatedArgs.excludeTags,
      formats: validatedArgs.formats,
      onlyMainContent: validatedArgs.onlyMainContent,
      actions: validatedArgs.actions,
      extract: (validatedArgs as { extract?: string }).extract,
    };

    logDebug("handleScrapeRequest", "Calling webhook service", {
      command: webhookRequest.command,
      url: webhookRequest.url,
      urlsCount: webhookRequest.urls?.length,
    });

    // Call webhook service
    const webhookResponse = await client.scrape(webhookRequest);

    logDebug("handleScrapeRequest", "Received webhook response", {
      success: webhookResponse.success,
      command: webhookResponse.command,
      hasData: !!webhookResponse.data,
      hasError: !!webhookResponse.error,
    });

    // Build MCP response from webhook response
    return buildWebhookResponse(
      webhookResponse,
      validatedArgs.maxChars,
      validatedArgs.startIndex,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid arguments: ${error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Failed to scrape ${(args as { url?: string })?.url || "URL"}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}
