import { FirecrawlJob } from "../types";
import { logger } from "./logger";
import { transformJobForLogging, createJobLoggerContext } from "./job-transform";

// BigQuery client will be imported conditionally to avoid errors if not installed
let BigQuery: any = null;
let bigquery: any = null;

try {
  // Dynamically import BigQuery to handle cases where it's not installed
  BigQuery = require("@google-cloud/bigquery").BigQuery;
  
  const credentials = process.env.GCS_CREDENTIALS
    ? JSON.parse(atob(process.env.GCS_CREDENTIALS))
    : undefined;

  bigquery = new BigQuery({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || "firecrawl",
    credentials,
  });
} catch (error) {
  logger.warn("BigQuery client not available. BigQuery logging will be disabled.", {
    error: error.message,
  });
}

/**
 * Transforms a FirecrawlJob into a BigQuery-compatible row
 */
function transformJobForBigQuery(job: FirecrawlJob) {
  const transformed = transformJobForLogging(job, {
    includeTimestamp: true,
    serializeObjects: true,
    cleanNullValues: false, // BigQuery handles null values fine
  });

  // Remove docs field from BigQuery to reduce storage costs and avoid size issues
  const { docs, ...bigQueryRow } = transformed;
  
  return bigQueryRow;
}

/**
 * Ensures the BigQuery dataset exists
 */
async function ensureBigQueryDataset(): Promise<void> {
  if (!bigquery || !process.env.BIGQUERY_DATASET_ID) {
    return;
  }

  try {
    const datasetId = process.env.BIGQUERY_DATASET_ID;
    const dataset = bigquery.dataset(datasetId);

    const [exists] = await dataset.exists();
    if (!exists) {
      logger.info("Creating BigQuery dataset", { dataset: datasetId });
      
      await dataset.create({
        location: process.env.BIGQUERY_LOCATION || "US",
      });

      logger.info("BigQuery dataset created successfully", { dataset: datasetId });
    }
  } catch (error) {
    logger.error("Error ensuring BigQuery dataset exists", {
      error,
      dataset: process.env.BIGQUERY_DATASET_ID,
    });
    throw error;
  }
}

/**
 * Creates the BigQuery table if it doesn't exist
 */
async function ensureBigQueryTable(): Promise<void> {
  if (!bigquery || !process.env.BIGQUERY_DATASET_ID) {
    return;
  }

  try {
    // Ensure dataset exists first
    // No need once it is initialized
    // await ensureBigQueryDataset();

    const datasetId = process.env.BIGQUERY_DATASET_ID;
    const tableId = process.env.BIGQUERY_TABLE_ID || "firecrawl_jobs";

    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);

    const [exists] = await table.exists();
    
    if (exists) {
      // Table exists, but let's check if it has the correct schema (without docs field)
      try {
        const [metadata] = await table.getMetadata();
        const currentSchema = metadata.schema;
        
        if (!currentSchema || !currentSchema.fields || currentSchema.fields.length === 0) {
          logger.warn("Table exists but has no schema, recreating table", {
            dataset: datasetId,
            table: tableId,
          });
          
          // Delete and recreate the table
          await table.delete();
          logger.info("Deleted table with no schema", { dataset: datasetId, table: tableId });
        } else {
          // Check if the table has the old schema with docs field or wrong data types
          const hasDocsField = currentSchema.fields.some((field: any) => field.name === 'docs');
          const timeTakenField = currentSchema.fields.find((field: any) => field.name === 'time_taken');
          const numTokensField = currentSchema.fields.find((field: any) => field.name === 'num_tokens');
          const hasWrongTimeTakenType = timeTakenField && timeTakenField.type !== 'FLOAT';
          const hasWrongNumTokensType = numTokensField && numTokensField.type !== 'FLOAT';
          
          if (hasDocsField) {
            logger.warn("Table has old schema with docs field, recreating table", {
              dataset: datasetId,
              table: tableId,
            });
            
            // Delete and recreate the table without docs field
            await table.delete();
            logger.info("Deleted table with old schema (docs field)", { dataset: datasetId, table: tableId });
          } else if (hasWrongTimeTakenType || hasWrongNumTokensType) {
            logger.warn("Table has wrong data types for numeric fields, recreating table", {
              dataset: datasetId,
              table: tableId,
              timeTakenType: timeTakenField?.type,
              numTokensType: numTokensField?.type,
              expectedType: 'FLOAT',
            });
            
            // Delete and recreate the table with correct data types
            await table.delete();
            logger.info("Deleted table with wrong schema (numeric field types)", { dataset: datasetId, table: tableId });
          } else {
            logger.debug("BigQuery table exists and has correct schema", {
              dataset: datasetId,
              table: tableId,
            });
            return;
          }
        }
      } catch (schemaError) {
        logger.error("Error checking table schema, recreating table", {
          error: schemaError,
          dataset: datasetId,
          table: tableId,
        });
        
        // Try to delete and recreate
        try {
          await table.delete();
          logger.info("Deleted problematic table", { dataset: datasetId, table: tableId });
        } catch (deleteError) {
          logger.error("Error deleting problematic table", { error: deleteError });
        }
      }
    }
    
    // Create the table (either it doesn't exist or we deleted it)
    logger.info("Creating BigQuery table", {
      dataset: datasetId,
      table: tableId,
    });

    const schema = [
      { name: "job_id", type: "STRING", mode: "NULLABLE" },
      { name: "success", type: "BOOLEAN", mode: "NULLABLE" },
      { name: "message", type: "STRING", mode: "NULLABLE" },
      { name: "num_docs", type: "INTEGER", mode: "NULLABLE" },
      // Note: docs field excluded from BigQuery to reduce storage costs and avoid size issues
      { name: "time_taken", type: "FLOAT", mode: "NULLABLE" },
      { name: "team_id", type: "STRING", mode: "NULLABLE" },
      { name: "mode", type: "STRING", mode: "NULLABLE" },
      { name: "url", type: "STRING", mode: "NULLABLE" },
      { name: "crawler_options", type: "STRING", mode: "NULLABLE" },
      { name: "page_options", type: "STRING", mode: "NULLABLE" },
      { name: "origin", type: "STRING", mode: "NULLABLE" },
      { name: "integration", type: "STRING", mode: "NULLABLE" },
      { name: "num_tokens", type: "FLOAT", mode: "NULLABLE" },
      { name: "retry", type: "BOOLEAN", mode: "NULLABLE" },
      { name: "crawl_id", type: "STRING", mode: "NULLABLE" },
      { name: "tokens_billed", type: "INTEGER", mode: "NULLABLE" },
      { name: "is_migrated", type: "BOOLEAN", mode: "NULLABLE" },
      { name: "cost_tracking", type: "STRING", mode: "NULLABLE" },
      { name: "pdf_num_pages", type: "INTEGER", mode: "NULLABLE" },
      { name: "credits_billed", type: "INTEGER", mode: "NULLABLE" },
      { name: "change_tracking_tag", type: "STRING", mode: "NULLABLE" },
      { name: "dr_clean_by", type: "TIMESTAMP", mode: "NULLABLE" },
      { name: "timestamp", type: "TIMESTAMP", mode: "NULLABLE" },
    ];

    const options = {
      schema: { fields: schema },
      timePartitioning: {
        type: "HOUR",
        field: "timestamp",
      },
      location: process.env.BIGQUERY_LOCATION || "US",
    };

    await table.create(options);

    logger.info("BigQuery table created successfully", {
      dataset: datasetId,
      table: tableId,
      schema: schema.length + " fields",
    });
  } catch (error) {
    logger.error("Error ensuring BigQuery table exists", {
      error,
      dataset: process.env.BIGQUERY_DATASET_ID,
      table: process.env.BIGQUERY_TABLE_ID || "firecrawl_jobs",
    });
    throw error;
  }
}

/**
 * Validates BigQuery configuration
 */
function validateBigQueryConfig(): { valid: boolean; error?: string } {
  if (!bigquery) {
    return { valid: false, error: "BigQuery client not initialized" };
  }

  if (!process.env.BIGQUERY_DATASET_ID) {
    return { valid: false, error: "BIGQUERY_DATASET_ID not configured" };
  }

  if (!process.env.GOOGLE_CLOUD_PROJECT_ID && !process.env.GCS_CREDENTIALS) {
    return { valid: false, error: "Google Cloud credentials not configured" };
  }

  return { valid: true };
}

/**
 * Saves a job to BigQuery
 */
export async function saveJobToBigQuery(
  job: FirecrawlJob,
  force: boolean = false
): Promise<void> {
  const configValidation = validateBigQueryConfig();
  if (!configValidation.valid) {
    logger.debug("BigQuery not configured, skipping BigQuery logging", {
      reason: configValidation.error,
    });
    return;
  }

  const jobLogger = logger.child({
    module: "bigquery_jobs",
    method: "saveJobToBigQuery",
    ...createJobLoggerContext(job),
  });

  try {
    // Ensure table exists before attempting to insert
    // await ensureBigQueryTable();

    const datasetId = process.env.BIGQUERY_DATASET_ID;
    const tableId = process.env.BIGQUERY_TABLE_ID || "firecrawl_jobs";
    const table = bigquery.dataset(datasetId).table(tableId);

    const row = transformJobForBigQuery(job) as any;

    // Validate the row has required fields
    if (!row.timestamp) {
      row.timestamp = new Date().toISOString();
    }

    jobLogger.debug("Attempting to insert job to BigQuery", {
      dataset: datasetId,
      table: tableId,
      jobId: job.job_id,
    });

    if (force) {
      let i = 0;
      let done = false;
      while (i++ <= 10 && !done) {
        try {
          await table.insert([row], {
            ignoreUnknownValues: false,
            skipInvalidRows: false,
          });
          done = true;
          jobLogger.debug("Job logged to BigQuery successfully!");
        } catch (error) {
          jobLogger.error(
            "Failed to log job to BigQuery due to error -- trying again",
            { 
              error: error.message || error,
              attempt: i,
              jobId: job.job_id,
              dataset: datasetId,
              table: tableId,
            }
          );
          
          // If it's a schema error, don't retry
          if (error.message && error.message.includes("schema")) {
            jobLogger.error("Schema error detected, stopping retries", { error: error.message });
            break;
          }
          
          await new Promise<void>((resolve) => setTimeout(() => resolve(), 100 * i));
        }
      }
      if (!done) {
        jobLogger.error("Failed to log job to BigQuery after all retries!");
      }
    } else {
      try {
        await table.insert([row], {
          ignoreUnknownValues: false,
          skipInvalidRows: false,
        });
        jobLogger.debug("Job logged to BigQuery successfully!");
      } catch (error) {
        jobLogger.error("Error logging job to BigQuery", { 
          error: error.message || error,
          jobId: job.job_id,
          dataset: datasetId,
          table: tableId,
        });
      }
    }
  } catch (error) {
    jobLogger.error("Error saving job to BigQuery", {
      error: error.message || error,
      jobId: job.job_id,
      dataset: process.env.BIGQUERY_DATASET_ID,
      table: process.env.BIGQUERY_TABLE_ID || "firecrawl_jobs",
    });
  }
}

/**
 * Queries jobs from BigQuery
 */
// export async function queryJobsFromBigQuery(
//   query: string,
//   params?: any[]
// ): Promise<any[]> {
//   if (!bigquery || !process.env.BIGQUERY_DATASET_ID) {
//     logger.warn("BigQuery not configured");
//     return [];
//   }

//   try {
//     const options = {
//       query,
//       params,
//       location: process.env.BIGQUERY_LOCATION || "US",
//     };

//     const [rows] = await bigquery.query(options);
//     return rows;
//   } catch (error) {
//     logger.error("Error querying jobs from BigQuery", { error, query });
//     throw error;
//   }
// }
