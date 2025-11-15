import { getEnvSnapshot } from "../config/environment.js";
import { ResourceStorage } from "./types.js";
import { MemoryResourceStorage } from "./memory.js";
import { FileSystemResourceStorage } from "./filesystem.js";
import { PostgresResourceStorage } from "./postgres.js";
import { WebhookPostgresStorage } from "./webhook-postgres.js";

export type StorageType =
  | "memory"
  | "filesystem"
  | "postgres"
  | "webhook-postgres";

export class ResourceStorageFactory {
  private static instance: ResourceStorage | null = null;

  static async create(): Promise<ResourceStorage> {
    if (this.instance) {
      return this.instance;
    }

    const runtimeEnv = getEnvSnapshot();
    const rawType = (runtimeEnv.resourceStorage || "memory").toLowerCase();
    const validTypes: StorageType[] = [
      "memory",
      "filesystem",
      "postgres",
      "webhook-postgres",
    ];
    if (!validTypes.includes(rawType as StorageType)) {
      throw new Error(
        `Unsupported storage type: ${rawType}. Supported types: memory, filesystem, postgres, webhook-postgres`,
      );
    }
    const storageType = rawType as StorageType;

    switch (storageType) {
      case "memory": {
        this.instance = new MemoryResourceStorage();
        break;
      }

      case "filesystem": {
        const rootDir = runtimeEnv.resourceFilesystemRoot;
        const fsStorage = new FileSystemResourceStorage(rootDir);
        await fsStorage.init();
        this.instance = fsStorage;
        break;
      }

      case "postgres": {
        this.instance = new PostgresResourceStorage();
        break;
      }

      case "webhook-postgres": {
        const webhookBaseUrl = runtimeEnv.webhookBaseUrl;
        const apiSecret = runtimeEnv.webhookApiSecret;

        if (!webhookBaseUrl || !apiSecret) {
          throw new Error(
            "webhook-postgres storage requires MCP_WEBHOOK_BASE_URL and MCP_WEBHOOK_API_SECRET to be set",
          );
        }

        // Convert TTL from seconds to milliseconds if provided
        const defaultTtl = runtimeEnv.resourceTtl
          ? parseInt(runtimeEnv.resourceTtl, 10) * 1000
          : undefined;

        this.instance = new WebhookPostgresStorage({
          webhookBaseUrl,
          apiSecret,
          defaultTtl,
        });
        break;
      }

      default:
        throw new Error(
          `Unsupported storage type: ${storageType}. Supported types: memory, filesystem, postgres, webhook-postgres`,
        );
    }

    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }
}
