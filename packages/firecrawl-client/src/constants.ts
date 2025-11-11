/**
 * @fileoverview Shared constants for Firecrawl client
 *
 * @module firecrawl-client/constants
 */

/**
 * Placeholder API key used for self-hosted Firecrawl deployments without authentication.
 * When this value is detected, the Authorization header will be omitted from requests.
 */
export const SELF_HOSTED_NO_AUTH = 'self-hosted-no-auth';
