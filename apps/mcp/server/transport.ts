import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { InMemoryEventStore } from './eventStore.js';

/**
 * Options for creating an HTTP streaming transport
 */
export interface TransportOptions {
  /**
   * Enable resumability support using event store
   * When enabled, clients can reconnect and resume from their last received event
   */
  enableResumability?: boolean;

  /**
   * Callback invoked when a new session is initialized
   */
  onSessionInitialized?: (sessionId: string) => void | Promise<void>;

  /**
   * Callback invoked when a session is closed
   */
  onSessionClosed?: (sessionId: string) => void | Promise<void>;
}

/**
 * Creates a StreamableHTTPServerTransport instance with appropriate configuration
 *
 * @param options - Configuration options for the transport
 * @returns Configured StreamableHTTPServerTransport instance
 *
 * @example
 * ```typescript
 * const transport = createTransport({
 *   enableResumability: true,
 *   onSessionInitialized: (sessionId) => {
 *     console.log(`Session ${sessionId} initialized`);
 *   }
 * });
 * ```
 */
export function createTransport(options?: TransportOptions): StreamableHTTPServerTransport {
  const {
    enableResumability = process.env.ENABLE_RESUMABILITY === 'true',
    onSessionInitialized,
    onSessionClosed,
  } = options || {};

  // Parse allowed origins - treat "*" as undefined (allow all)
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  const allowedOrigins =
    allowedOriginsEnv && allowedOriginsEnv !== '*'
      ? allowedOriginsEnv.split(',').filter(Boolean)
      : undefined;

  return new StreamableHTTPServerTransport({
    // Generate cryptographically secure session IDs
    sessionIdGenerator: () => randomUUID(),

    // Enable resumability if configured
    eventStore: enableResumability ? new InMemoryEventStore() : undefined,

    // Session lifecycle callbacks
    onsessioninitialized: onSessionInitialized,
    onsessionclosed: onSessionClosed,

    // Return JSON responses instead of SSE streaming for POST requests
    enableJsonResponse: true,

    // DNS rebinding protection (enabled in production)
    enableDnsRebindingProtection: process.env.NODE_ENV === 'production',
    allowedHosts: process.env.ALLOWED_HOSTS?.split(',').filter(Boolean),
    allowedOrigins,
  });
}
