const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
];

/**
 * Preprocess URL by adding https:// if no protocol specified.
 * Validates protocol and prevents SSRF attacks.
 */
export function preprocessUrl(url: string): string {
  let processed = url.trim();

  // Check for dangerous protocols BEFORE adding https://
  // This catches explicit file://, javascript://, data:// attempts
  if (processed.match(/^(file|javascript|data):/i)) {
    const match = processed.match(/^([^:]+):/);
    const protocol = match ? match[1] : 'unknown';
    throw new Error(
      `Invalid protocol: ${protocol}:. Only HTTP/HTTPS allowed.`
    );
  }

  // Add https:// if no protocol
  if (!processed.match(/^https?:\/\//i)) {
    processed = `https://${processed}`;
  }

  // Validate the final URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(processed);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Enforce HTTP/HTTPS only (final validation after protocol addition)
  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(
      `Invalid protocol: ${parsedUrl.protocol}. Only HTTP/HTTPS allowed.`
    );
  }

  // Prevent localhost/private IP SSRF
  const hostname = parsedUrl.hostname.toLowerCase();
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Private IP addresses not allowed: ${hostname}`);
    }
  }

  return processed;
}
