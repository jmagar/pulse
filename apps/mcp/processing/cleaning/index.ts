/**
 * Interface for content cleaners
 */
export interface ContentCleaner {
  /**
   * Clean raw content to extract the most relevant parts
   * @param content The raw content to clean
   * @param url The source URL (can help with context)
   * @returns The cleaned content
   */
  clean(content: string, url: string): Promise<string>;

  /**
   * Check if this cleaner can handle the given content type
   * @param contentType The detected content type
   * @returns Whether this cleaner should be used
   */
  canHandle(contentType: string): boolean;
}

/**
 * Options for content cleaners
 */
export interface CleanerOptions {
  /**
   * Maximum length of cleaned content (optional)
   * If not specified, the cleaner will use its own judgment
   */
  maxLength?: number;
}

export * from "./base-cleaner.js";
export * from "./cleaner-factory.js";
export * from "./content-type-detector.js";
export * from "./html-cleaner.js";
export * from "./pass-through-cleaner.js";
