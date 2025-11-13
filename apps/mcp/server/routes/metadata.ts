import type { Request, Response } from "express";

import { loadOAuthConfig } from "../../config/oauth.js";
import { BASE_SCOPES, TOOL_SCOPE_MAP } from "../oauth/scopes.js";

export function oauthProtectedResource(req: Request, res: Response): void {
  const config = loadOAuthConfig();
  if (!config) {
    res.status(404).json({ error: "OAuth is not enabled" });
    return;
  }

  const scopes = Array.from(
    new Set([
      ...BASE_SCOPES,
      ...Object.values(TOOL_SCOPE_MAP).flat(),
      ...config.scopes,
    ]),
  );

  res.json({
    resource: config.resourceIndicator,
    authorization_servers: [config.authorizationServer],
    scopes_supported: scopes,
    bearer_methods_supported: ["header"],
    resource_signing_alg_values_supported: ["RS256"],
  });
}
