import { logger as _logger } from "../../lib/logger";
import {
  finishCrawl,
  getCrawlJobs,
  getDoneJobsOrderedLength,
} from "../../lib/crawl-redis";
import { getCrawl } from "../../lib/crawl-redis";
import { supabase_service } from "../supabase";
import { getJobs } from "../../controllers/v1/crawl-status";
import { logJob } from "../logging/log_job";
import { createWebhookSender, WebhookEvent } from "../webhook/index";
import type { NuQJob } from "./nuq";

export async function finishCrawlSuper(job: NuQJob<any>) {
  const crawlId = job.groupId;

  if (!crawlId) {
    return;
  }

  const sc = await getCrawl(crawlId);

  if (!sc) {
    return;
  }

  const logger = _logger.child({
    module: "queue-worker",
    method: "finishCrawl",
    jobId: job.id,
    scrapeId: job.id,
    crawlId,
    zeroDataRetention: sc.internalOptions.zeroDataRetention,
  });

  logger.info("Finishing crawl");
  await finishCrawl(crawlId, logger);

  if (!job.data.v1) {
    const jobIDs = await getCrawlJobs(crawlId);

    const jobs = (await getJobs(jobIDs)).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    // const jobStatuses = await Promise.all(jobs.map((x) => x.getState()));
    const jobStatus = sc.cancelled // || jobStatuses.some((x) => x === "failed")
      ? "failed"
      : "completed";

    const fullDocs = jobs
      .map(x =>
        x.returnvalue
          ? Array.isArray(x.returnvalue)
            ? x.returnvalue[0]
            : x.returnvalue
          : null,
      )
      .filter(x => x !== null);

    await logJob(
      {
        job_id: crawlId,
        success: jobStatus === "completed",
        message: sc.cancelled ? "Cancelled" : undefined,
        num_docs: fullDocs.length,
        docs: [],
        time_taken: (Date.now() - sc.createdAt) / 1000,
        team_id: job.data.team_id,
        mode: sc.crawlerOptions !== null ? "crawl" : "batch_scrape",
        url: sc.originUrl!,
        scrapeOptions: sc.scrapeOptions,
        crawlerOptions: sc.crawlerOptions,
        origin: sc.originUrl!,
        integration: job.data.integration,
        zeroDataRetention: job.data.zeroDataRetention,
      },
      false,
      sc.internalOptions?.bypassBilling ?? false,
    );

    // v0 web hooks, call when done with all the data
    if (!job.data.v1) {
      const sender = await createWebhookSender({
        teamId: job.data.team_id,
        jobId: crawlId,
        webhook: job.data.webhook,
        v0: true,
      });
      if (sender) {
        const documents = fullDocs.map((doc: any) => ({
          content: {
            content: doc?.content ?? doc?.rawHtml ?? doc?.markdown ?? "",
            markdown: doc?.markdown,
            metadata: doc?.metadata ?? {},
          },
          source: doc?.metadata?.sourceURL ?? doc?.url ?? "",
        }));
        if (sc.crawlerOptions !== null) {
          sender.send(WebhookEvent.CRAWL_COMPLETED, {
            success: true,
            data: documents,
          });
        } else {
          sender.send(WebhookEvent.BATCH_SCRAPE_COMPLETED, {
            success: true,
            data: documents,
          });
        }
      }
    }
  } else {
    const num_docs = await getDoneJobsOrderedLength(crawlId);
    const jobStatus = sc.cancelled ? "failed" : "completed";

    let credits_billed = null;

    if (process.env.USE_DB_AUTHENTICATION === "true") {
      const creditsRpc = await supabase_service.rpc(
        "credits_billed_by_crawl_id_1",
        {
          i_crawl_id: crawlId,
        },
      );

      credits_billed = creditsRpc.data?.[0]?.credits_billed ?? null;

      if (credits_billed === null) {
        logger.warn("Credits billed is null", {
          error: creditsRpc.error,
        });
      }
    }

    await logJob(
      {
        job_id: crawlId,
        success: jobStatus === "completed",
        message: sc.cancelled ? "Cancelled" : undefined,
        num_docs,
        docs: [],
        time_taken: (Date.now() - sc.createdAt) / 1000,
        team_id: sc.team_id,
        scrapeOptions: sc.scrapeOptions,
        mode: sc.crawlerOptions !== null ? "crawl" : "batch_scrape",
        url:
          sc?.originUrl ??
          (sc.crawlerOptions === null ? "Batch Scrape" : "Unknown"),
        crawlerOptions: sc.crawlerOptions,
        origin: job.data.origin,
        integration: job.data.integration,
        credits_billed,
        zeroDataRetention: job.data.zeroDataRetention,
      },
      true,
      sc.internalOptions?.bypassBilling ?? false,
    );

    // v1 web hooks, call when done with no data, but with event completed
    if (job.data.v1 && job.data.webhook) {
      const sender = await createWebhookSender({
        teamId: job.data.team_id,
        jobId: crawlId,
        webhook: job.data.webhook,
        v0: false,
      });
      if (sender) {
        if (sc.crawlerOptions !== null) {
          sender.send(WebhookEvent.CRAWL_COMPLETED, {
            success: true,
            data: [],
          });
        } else {
          sender.send(WebhookEvent.BATCH_SCRAPE_COMPLETED, {
            success: true,
            data: [],
          });
        }
      }
    }
  }
}
