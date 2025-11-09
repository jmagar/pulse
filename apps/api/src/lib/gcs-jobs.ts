import { FirecrawlJob } from "../types";
import { ApiError, Storage } from "@google-cloud/storage";
import { logger } from "./logger";
import { Document } from "../controllers/v1/types";
import { withSpan, setSpanAttributes } from "./otel-tracer";

const credentials = process.env.GCS_CREDENTIALS
  ? JSON.parse(atob(process.env.GCS_CREDENTIALS))
  : undefined;
export const storage = new Storage({ credentials });

export async function saveJobToGCS(job: FirecrawlJob): Promise<void> {
  return await withSpan("firecrawl-gcs-save-job", async span => {
    setSpanAttributes(span, {
      "gcs.operation": "save_job",
      "job.id": job.job_id,
      "job.team_id": job.team_id,
      "job.mode": job.mode,
      "job.success": job.success,
      "job.num_docs": job.num_docs,
    });

    if (!process.env.GCS_BUCKET_NAME) {
      setSpanAttributes(span, { "gcs.bucket_configured": false });
      return;
    }

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const blob = bucket.file(`${job.job_id}.json`);

    // Save job docs with retry
    for (let i = 0; i < 3; i++) {
      try {
        await blob.save(JSON.stringify(job.docs), {
          contentType: "application/json",
        });
        break;
      } catch (error) {
        if (i === 2) {
          throw error;
        } else {
          logger.error(`Error saving job to GCS, retrying`, {
            error,
            scrapeId: job.job_id,
            jobId: job.job_id,
            i,
          });
        }
      }
    }

    // Save job metadata with retry
    for (let i = 0; i < 3; i++) {
      try {
        await blob.setMetadata({
          metadata: {
            job_id: job.job_id ?? null,
            success: job.success,
            message: job.message ?? null,
            num_docs: job.num_docs,
            time_taken: job.time_taken,
            team_id:
              job.team_id === "preview" || job.team_id?.startsWith("preview_")
                ? null
                : job.team_id,
            mode: job.mode,
            url: job.url,
            crawler_options: JSON.stringify(job.crawlerOptions),
            page_options: JSON.stringify(job.scrapeOptions),
            origin: job.origin,
            integration: job.integration ?? null,
            num_tokens: job.num_tokens ?? null,
            retry: !!job.retry,
            crawl_id: job.crawl_id ?? null,
            tokens_billed: job.tokens_billed ?? null,
          },
        });
        break;
      } catch (error) {
        if (i === 2) {
          throw error;
        } else {
          logger.error(`Error saving job metadata to GCS, retrying`, {
            error,
            scrapeId: job.job_id,
            jobId: job.job_id,
            i,
          });
        }
      }
    }

    setSpanAttributes(span, { "gcs.save_successful": true });
  }).catch(error => {
    logger.error(`Error saving job to GCS`, {
      error,
      scrapeId: job.job_id,
      jobId: job.job_id,
    });
    throw error;
  });
}

export async function getJobFromGCS(jobId: string): Promise<Document[] | null> {
  return await withSpan("firecrawl-gcs-get-job", async span => {
    setSpanAttributes(span, {
      "gcs.operation": "get_job",
      "job.id": jobId,
    });

    if (!process.env.GCS_BUCKET_NAME) {
      setSpanAttributes(span, { "gcs.bucket_configured": false });
      return null;
    }

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const blob = bucket.file(`${jobId}.json`);

    try {
      const [content] = await blob.download();
      const result = JSON.parse(content.toString());
      setSpanAttributes(span, { "gcs.job_found": true });
      return result;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 404 &&
        error.message.includes("No such object:")
      ) {
        setSpanAttributes(span, { "gcs.job_found": false });
        return null;
      }

      logger.error(`Error getting job from GCS`, {
        error,
        jobId,
        scrapeId: jobId,
      });
      throw error;
    }
  });
}

export async function removeJobFromGCS(jobId: string): Promise<void> {
  return await withSpan("firecrawl-gcs-remove-job", async span => {
    setSpanAttributes(span, {
      "gcs.operation": "remove_job",
      "job.id": jobId,
    });

    if (!process.env.GCS_BUCKET_NAME) {
      setSpanAttributes(span, { "gcs.bucket_configured": false });
      return;
    }

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const blob = bucket.file(`${jobId}.json`);

    try {
      await blob.delete({
        ignoreNotFound: true,
      });
      setSpanAttributes(span, { "gcs.delete_successful": true });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 404 &&
        error.message.includes("No such object:")
      ) {
        setSpanAttributes(span, { "gcs.job_not_found": true });
        return;
      }

      logger.error(`Error removing job from GCS`, {
        error,
        jobId,
        scrapeId: jobId,
      });
      throw error;
    }
  });
}

// TODO: fix the any type (we have multiple Document types in the codebase)
export async function getDocFromGCS(url: string): Promise<any | null> {
  //   logger.info(`Getting f-engine document from GCS`, {
  //     url,
  //   });
  try {
    if (!process.env.GCS_FIRE_ENGINE_BUCKET_NAME) {
      return null;
    }

    const bucket = storage.bucket(process.env.GCS_FIRE_ENGINE_BUCKET_NAME);
    const blob = bucket.file(`${url}`);
    const [exists] = await blob.exists();
    if (!exists) {
      return null;
    }
    const [blobContent] = await blob.download();
    const parsed = JSON.parse(blobContent.toString());
    return parsed;
  } catch (error) {
    logger.error(`Error getting f-engine document from GCS`, {
      error,
      url,
    });
    return null;
  }
}
