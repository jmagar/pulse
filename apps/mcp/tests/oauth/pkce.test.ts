import { describe, expect, it } from "vitest";

import {
  createPkceVerifier,
  createPkceChallenge,
  verifyPkcePair,
} from "../../server/oauth/pkce.js";

const BASE64URL_PATTERN = /^[A-Za-z0-9\-_.~]+$/;

describe("PKCE helpers", () => {
  it("creates a verifier with sufficient entropy", () => {
    const verifier = createPkceVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(64);
    expect(BASE64URL_PATTERN.test(verifier)).toBe(true);
  });

  it("derives the correct challenge from a verifier", () => {
    const verifier = "test-verifier-value";
    const challenge = createPkceChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(0);
    expect(BASE64URL_PATTERN.test(challenge)).toBe(true);
  });

  it("validates matching verifier/challenge pairs", () => {
    const verifier = createPkceVerifier();
    const challenge = createPkceChallenge(verifier);
    expect(verifyPkcePair({ verifier, challenge })).toBe(true);
  });

  it("rejects mismatched pairs", () => {
    const verifier = createPkceVerifier();
    const challenge = createPkceChallenge(createPkceVerifier());
    expect(verifyPkcePair({ verifier, challenge })).toBe(false);
  });
});
