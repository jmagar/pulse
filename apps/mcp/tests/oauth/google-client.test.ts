import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateAuthUrl = vi.fn();
const mockGetToken = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockRevokeToken = vi.fn();
const mockVerifyIdToken = vi.fn();
const mockSetCredentials = vi.fn();

vi.mock("google-auth-library", () => {
  const ctor = vi.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    refreshAccessToken: mockRefreshAccessToken,
    revokeToken: mockRevokeToken,
    verifyIdToken: mockVerifyIdToken,
    setCredentials: mockSetCredentials,
  }));
  return { OAuth2Client: ctor };
});

import { createGoogleOAuthClient } from "../../server/oauth/google-client.js";
import type { OAuthConfig } from "../../config/oauth.js";

const baseConfig: OAuthConfig = {
  enabled: true,
  clientId: "client-id",
  clientSecret: "secret",
  redirectUri: "https://app/callback",
  scopes: ["openid", "email"],
  sessionSecret: "s".repeat(64),
  tokenEncryptionKey: "t".repeat(64),
  resourceIndicator: "https://pulse-mcp.local",
  authorizationServer: "https://accounts.google.com",
  tokenTtlSeconds: 3600,
  refreshTtlSeconds: 2592000,
};

describe("Google OAuth client wrapper", () => {
  beforeEach(() => {
    mockGenerateAuthUrl.mockReset();
    mockGetToken.mockReset();
    mockRefreshAccessToken.mockReset();
    mockRevokeToken.mockReset();
    mockVerifyIdToken.mockReset();
    mockSetCredentials.mockReset();
  });

  it("builds authorization URL with PKCE data", () => {
    mockGenerateAuthUrl.mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    const client = createGoogleOAuthClient(baseConfig);
    const url = client.createAuthUrl({
      codeChallenge: "challenge",
      state: "state123",
    });
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: baseConfig.scopes,
        code_challenge: "challenge",
        code_challenge_method: expect.any(String),
        state: "state123",
        resource: baseConfig.resourceIndicator,
      }),
    );
    expect(url).toContain("accounts.google.com");
  });

  it("exchanges authorization code for tokens", async () => {
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expiry_date: 123456,
        id_token: "id-token",
        scope: "openid email",
      },
    });

    const client = createGoogleOAuthClient(baseConfig);
    const tokens = await client.exchangeCode({
      code: "auth-code",
      codeVerifier: "verifier",
    });

    expect(mockGetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "auth-code",
        codeVerifier: "verifier",
        redirect_uri: baseConfig.redirectUri,
      }),
    );
    expect(tokens.accessToken).toBe("ya29.access");
    expect(tokens.refreshToken).toBe("1//refresh");
    expect(tokens.idToken).toBe("id-token");
  });

  it("refreshes tokens", async () => {
    mockRefreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "ya29.new",
        expiry_date: 987654,
        scope: "openid",
      },
    });

    const client = createGoogleOAuthClient(baseConfig);
    const tokens = await client.refreshAccessToken("1//refresh");
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: "1//refresh",
    });
    expect(tokens.accessToken).toBe("ya29.new");
  });

  it("revokes tokens", async () => {
    mockRevokeToken.mockResolvedValue({ status: 200 });
    const client = createGoogleOAuthClient(baseConfig);
    await client.revokeToken("token");
    expect(mockRevokeToken).toHaveBeenCalledWith("token");
  });

  it("verifies ID tokens", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "123" }),
    });
    const client = createGoogleOAuthClient(baseConfig);
    const payload = await client.verifyIdToken("id-token");
    expect(payload?.sub).toBe("123");
    expect(mockVerifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({
        idToken: "id-token",
        audience: baseConfig.clientId,
      }),
    );
  });
});
