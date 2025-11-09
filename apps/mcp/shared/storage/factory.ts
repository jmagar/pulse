import { ResourceStorage } from './types.js';
import { MemoryResourceStorage } from './memory.js';
import { FileSystemResourceStorage } from './filesystem.js';

export type StorageType = 'memory' | 'filesystem';

export class ResourceStorageFactory {
  private static instance: ResourceStorage | null = null;

  static async create(): Promise<ResourceStorage> {
    if (this.instance) {
      return this.instance;
    }

    const rawType = (process.env.MCP_RESOURCE_STORAGE || 'memory').toLowerCase();
    const validTypes: StorageType[] = ['memory', 'filesystem'];
    const storageType = validTypes.includes(rawType as StorageType)
      ? (rawType as StorageType)
      : 'memory';

    switch (storageType) {
      case 'memory': {
        this.instance = new MemoryResourceStorage();
        break;
      }

      case 'filesystem': {
        const rootDir = process.env.MCP_RESOURCE_FILESYSTEM_ROOT;
        const fsStorage = new FileSystemResourceStorage(rootDir);
        await fsStorage.init();
        this.instance = fsStorage;
        break;
      }

      default:
        throw new Error(
          `Unsupported storage type: ${storageType}. Supported types: memory, filesystem`
        );
    }

    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }
}
