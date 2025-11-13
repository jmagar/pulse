/**
 * Preprocess URL by adding https:// if no protocol specified.
 * Matches behavior of scrape tool for consistency.
 */
export function preprocessUrl(url: string): string {
  let processed = url.trim();

  // Add https:// if no protocol
  if (!processed.match(/^https?:\/\//i)) {
    processed = `https://${processed}`;
  }

  // Validate the final URL
  try {
    new URL(processed);
    return processed;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
}
