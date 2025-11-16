export const BASE_SCOPES = ["openid", "email", "profile"] as const;

export const TOOL_SCOPE_MAP: Record<string, string[]> = {
  scrape: ["mcp:scrape"],
  crawl: ["mcp:crawl"],
  extract: ["mcp:extract"],
  map: ["mcp:map"],
  query: ["mcp:query"],
};

export function getRequiredScopes(toolName: string): string[] {
  return TOOL_SCOPE_MAP[toolName] ?? [];
}
