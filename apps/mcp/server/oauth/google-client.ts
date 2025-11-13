import { OAuth2Client, type TokenPayload, type Credentials } from "google-auth-library";
import type { CodeChallengeMethod } from "google-auth-library/build/src/auth/oauth2client.js";

import type { OAuthConfig } from "../../config/oauth.js";

export interface AuthUrlParams {
  codeChallenge: string;
  state: string;
}

export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  idToken?: string;
  scope?: string;
}

const CODE_CHALLENGE_METHOD = "S256" as unknown as CodeChallengeMethod;

function normalizeTokens(tokens: Credentials): TokenResult {
  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? undefined,
    expiryDate: tokens.expiry_date ?? undefined,
    idToken: tokens.id_token ?? undefined,
    scope: tokens.scope ?? undefined,
  };
}

export function createGoogleOAuthClient(config: OAuthConfig) {
  const client = new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );

  function createAuthUrl(params: AuthUrlParams): string {
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: config.scopes,
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: CODE_CHALLENGE_METHOD,
      resource: config.resourceIndicator,
    });
  }

  async function exchangeCode(args: {
    code: string;
    codeVerifier: string;
  }): Promise<TokenResult> {
    const response = await client.getToken({
      code: args.code,
      codeVerifier: args.codeVerifier,
      redirect_uri: config.redirectUri,
    });
    return normalizeTokens(response.tokens);
  }

  async function refreshAccessToken(refreshToken?: string): Promise<TokenResult> {
    if (refreshToken) {
      client.setCredentials({ refresh_token: refreshToken });
    }
    const { credentials } = await client.refreshAccessToken();
    return normalizeTokens(credentials);
  }

  async function revokeToken(token: string): Promise<void> {
    await client.revokeToken(token);
  }

  async function verifyIdToken(idToken: string): Promise<TokenPayload | undefined> {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.clientId,
    });
    return ticket.getPayload() ?? undefined;
  }

  return {
    createAuthUrl,
    exchangeCode,
    refreshAccessToken,
    revokeToken,
    verifyIdToken,
  };
}
