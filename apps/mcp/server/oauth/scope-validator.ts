import type { Request } from "express";

import { getRequiredScopes } from "./scopes.js";

function getToolNameFromRequest(req: Request): string | null {
  const params = req.body?.params;
  if (typeof params?.name === "string") {
    return params.name;
  }
  if (typeof params?.tool?.name === "string") {
    return params.tool.name;
  }
  return null;
}

export function getScopesForRequest(req: Request): string[] {
  if (req.method !== "POST" || typeof req.body !== "object") {
    return [];
  }

  const method = req.body?.method;
  if (method === "tools/call") {
    const toolName = getToolNameFromRequest(req);
    if (toolName) {
      return getRequiredScopes(toolName);
    }
  }

  return [];
}
