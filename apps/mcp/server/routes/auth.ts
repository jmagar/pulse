import { Router } from "express";
import { randomUUID } from "node:crypto";

import { loadOAuthConfig } from "../../config/oauth.js";
import { createPkceChallenge, createPkceVerifier } from "../oauth/pkce.js";
import { createGoogleOAuthClient } from "../oauth/google-client.js";
import { createTokenManager } from "../oauth/token-manager.js";
import { createTokenStore } from "../storage/factory.js";
import { csrfProtection } from "../middleware/csrf.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { logAuditEvent } from "../oauth/audit-logger.js";
import type { TokenStore } from "../storage/token-store.js";
import type { TokenResult } from "../oauth/google-client.js";
import type { OAuthConfig } from "../../config/oauth.js";

interface AuthRouterDependencies {
  config: OAuthConfig;
  tokenManager: ReturnType<typeof createTokenManager>;
  googleClient: ReturnType<typeof createGoogleOAuthClient>;
}

interface CreateAuthRouterOptions {
  config?: OAuthConfig | null;
  tokenStore?: TokenStore;
  tokenManager?: AuthRouterDependencies["tokenManager"];
  googleClient?: AuthRouterDependencies["googleClient"];
}

function ensureConfig(config: OAuthConfig | null | undefined): OAuthConfig {
  if (!config) {
    throw new Error("OAuth is not enabled");
  }
  return config;
}

function buildScopes(tokens: TokenResult, config: OAuthConfig): string[] {
  if (tokens.scope) {
    return tokens.scope.split(" ").filter(Boolean);
  }
  return config.scopes;
}

function resolveExpiry(tokens: TokenResult, config: OAuthConfig): Date {
  if (tokens.expiryDate) {
    return new Date(tokens.expiryDate);
  }
  return new Date(Date.now() + config.tokenTtlSeconds * 1000);
}

async function saveTokens(
  userId: string,
  sessionId: string,
  tokens: TokenResult,
  scopes: string[],
  tokenManager: ReturnType<typeof createTokenManager>,
  config: OAuthConfig,
  createdAt?: Date,
): Promise<void> {
  const timestamp = createdAt ?? new Date();
  const expiresAt = resolveExpiry(tokens, config);
  await tokenManager.save({
    userId,
    sessionId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: "Bearer",
    expiresAt,
    scopes,
    idToken: tokens.idToken,
    createdAt: timestamp,
    updatedAt: new Date(),
  });
}

export async function createAuthRouter(
  options: CreateAuthRouterOptions = {},
): Promise<Router> {
  const config = ensureConfig(options.config ?? loadOAuthConfig());
  const tokenManager =
    options.tokenManager ??
    createTokenManager({
      store: options.tokenStore ?? (await createTokenStore()),
      encryptionKey: config.tokenEncryptionKey,
    });
  const googleClient = options.googleClient ?? createGoogleOAuthClient(config);

  const router = Router();

  const initiateLimiter = createRateLimiter({ windowMs: 60_000, limit: 5 });
  const callbackLimiter = createRateLimiter({ windowMs: 60_000, limit: 10 });

  router.get("/auth/google", initiateLimiter, (req, res) => {
    if (!req.session) {
      res.status(500).json({ error: "Session middleware not initialized" });
      return;
    }

    const codeVerifier = createPkceVerifier();
    const codeChallenge = createPkceChallenge(codeVerifier);
    const state = randomUUID();

    req.session.oauth = {
      codeVerifier,
      state,
    };

    const url = googleClient.createAuthUrl({
      codeChallenge,
      state,
    });

    res.redirect(302, url);
  });

  router.get(
    "/auth/google/callback",
    callbackLimiter,
    async (req, res, next) => {
      try {
        if (!req.session || !req.session.oauth) {
          res.status(400).json({ error: "Session not initialized" });
          return;
        }

        const { code } = req.query;
        const state = req.query.state as string | undefined;

        if (typeof code !== "string" || !state) {
          res.status(400).json({ error: "Missing code or state" });
          return;
        }

        if (state !== req.session.oauth.state) {
          res.status(400).json({ error: "Invalid OAuth state" });
          return;
        }

        const tokens = await googleClient.exchangeCode({
          code,
          codeVerifier: req.session.oauth.codeVerifier,
        });

        const payload = tokens.idToken
          ? await googleClient.verifyIdToken(tokens.idToken)
          : undefined;

        const userId = payload?.sub ?? req.sessionID;
        const scopes = buildScopes(tokens, config);

        await saveTokens(
          userId,
          req.sessionID,
          tokens,
          scopes,
          tokenManager,
          config,
        );
        await logAuditEvent({
          type: "login_success",
          userId,
          ip: req.ip,
          userAgent: req.headers["user-agent"] as string | undefined,
          eventData: { scopes },
        });

        req.session.user = {
          id: userId,
          email: payload?.email,
          scopes,
          expiresAt: resolveExpiry(tokens, config).toISOString(),
        };
        delete req.session.oauth;

        res.json({ authenticated: true, user: req.session.user });
      } catch (error) {
        await logAuditEvent({
          type: "login_failure",
          success: false,
          errorMessage: (error as Error).message,
          ip: req.ip,
          userAgent: req.headers["user-agent"] as string | undefined,
        });
        next(error);
      }
    },
  );

  router.get("/auth/status", async (req, res) => {
    if (!req.session?.user) {
      res.status(401).json({ authenticated: false });
      return;
    }

    res.json({ authenticated: true, user: req.session.user });
  });

  router.post("/auth/logout", csrfProtection, async (req, res, next) => {
    try {
      if (req.session?.user) {
        const record = await tokenManager.get(req.session.user.id);
        if (record?.accessToken) {
          await googleClient.revokeToken(record.accessToken);
          await logAuditEvent({
            type: "token_revoke",
            userId: req.session.user.id,
            eventData: { token: "access" },
          });
        }
        if (record?.refreshToken) {
          await googleClient.revokeToken(record.refreshToken);
          await logAuditEvent({
            type: "token_revoke",
            userId: req.session.user.id,
            eventData: { token: "refresh" },
          });
        }
        await tokenManager.delete(req.session.user.id);
        await logAuditEvent({
          type: "logout",
          userId: req.session.user.id,
          ip: req.ip,
        });
      }

      await new Promise<void>((resolve) => {
        req.session?.destroy(() => resolve());
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/refresh", csrfProtection, async (req, res, next) => {
    try {
      if (!req.session?.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const record = await tokenManager.get(req.session.user.id);
      if (!record?.refreshToken) {
        res.status(400).json({ error: "No refresh token available" });
        return;
      }

      const tokens = await googleClient.refreshAccessToken(record.refreshToken);
      const scopes = buildScopes(tokens, config);
      const mergedTokens: TokenResult = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? record.refreshToken,
        expiryDate: tokens.expiryDate,
        idToken: tokens.idToken ?? record.idToken,
        scope: tokens.scope ?? scopes.join(" "),
      };

      await saveTokens(
        record.userId,
        record.sessionId,
        mergedTokens,
        scopes,
        tokenManager,
        config,
        record.createdAt,
      );

      const expiresAt = resolveExpiry(mergedTokens, config).toISOString();
      req.session.user = {
        ...req.session.user,
        expiresAt,
        scopes,
      };

      res.json({ accessToken: mergedTokens.accessToken, expiresAt, scopes });
      await logAuditEvent({
        type: "token_refresh",
        userId: record.userId,
        eventData: { scopes },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
