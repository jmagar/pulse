import { env } from '../../config/environment.js';
import type { IExtractClient, LLMConfig } from './types.js';
import { AnthropicExtractClient } from './providers/anthropic-client.js';
import { OpenAIExtractClient } from './providers/openai-client.js';
import { OpenAICompatibleExtractClient } from './providers/openai-compatible-client.js';

/**
 * Factory for creating extract clients based on configuration
 */
export class ExtractClientFactory {
  /**
   * Create an extract client from environment variables
   * Returns null if no configuration is found
   */
  static createFromEnv(): IExtractClient | null {
    const provider = env.llmProvider as LLMConfig['provider'] | undefined;
    const apiKey = env.llmApiKey;

    if (!provider || !apiKey) {
      return null;
    }

    const config: LLMConfig = {
      provider,
      apiKey,
      model: env.llmModel,
      apiBaseUrl: env.llmApiBaseUrl,
    };

    return this.create(config);
  }

  /**
   * Create an extract client from configuration
   */
  static create(config: LLMConfig): IExtractClient {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicExtractClient(config);
      case 'openai':
        return new OpenAIExtractClient(config);
      case 'openai-compatible':
        return new OpenAICompatibleExtractClient(config);
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  /**
   * Check if extract functionality is available
   * (either through environment configuration or MCP sampling)
   */
  static isAvailable(): boolean {
    // Check for environment configuration
    const hasEnvConfig = !!(env.llmProvider && env.llmApiKey);

    // TODO: Check for MCP sampling capability when implemented

    return hasEnvConfig;
  }
}
