import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_VERIFIER_BYTE_LENGTH = 64;

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

/**
 * Generate a high-entropy PKCE code verifier.
 */
export function createPkceVerifier(
  byteLength: number = DEFAULT_VERIFIER_BYTE_LENGTH,
): string {
  if (byteLength < 32) {
    throw new Error("PKCE verifier must be at least 32 bytes");
  }
  const random = randomBytes(byteLength);
  return base64UrlEncode(random);
}

/**
 * Create the PKCE code challenge (S256) from a verifier.
 */
export function createPkceChallenge(verifier: string): string {
  const digest = createHash("sha256").update(verifier).digest();
  return base64UrlEncode(digest);
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * Verify that a verifier/challenge pair match.
 */
export function verifyPkcePair({
  verifier,
  challenge,
}: PkcePair): boolean {
  if (!verifier || !challenge) {
    return false;
  }
  const derived = createPkceChallenge(verifier);
  if (derived.length !== challenge.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(derived), Buffer.from(challenge));
}
