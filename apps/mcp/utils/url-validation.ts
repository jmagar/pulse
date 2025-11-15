/**
 * URL validation utilities with SSRF protection
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,           // AWS metadata service
  /^\[?::1\]?$/,                    // IPv6 loopback
  /^\[?fe80:/i,                     // IPv6 link-local
  /^\[?fc00:/i,                     // IPv6 unique local (fc00::/7)
  /^\[?fd[0-9a-f]{2}:/i,            // IPv6 unique local (fd00::/8)
];

/**
 * Preprocess and validate URL with SSRF protection
 *
 * @param url - URL to preprocess
 * @returns Validated URL with protocol
 * @throws Error if URL is invalid or uses dangerous protocol/IP
 */
export function preprocessUrl(url: string): string {
  let processed = url.trim();

  // SSRF protection - check for dangerous protocols
  if (processed.match(/^(file|javascript|data):/i)) {
    throw new Error(
      `Invalid protocol: URLs with file://, javascript:, or data: protocols are not allowed`
    );
  }

  // Add https:// if no protocol
  if (!processed.match(/^https?:\/\//i)) {
    processed = `https://${processed}`;
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(processed);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Enforce HTTP/HTTPS only
  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(
      `Invalid protocol: Only HTTP and HTTPS protocols are allowed, got ${parsedUrl.protocol}`
    );
  }

  // Prevent localhost/private IP SSRF
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(parsedUrl.hostname)) {
      throw new Error(
        `Private IP addresses not allowed: ${parsedUrl.hostname} is a private/local address`
      );
    }
  }

  return processed;
}
