packages/firecrawl-client/src/operations/scrape.ts
Comment on lines +34 to +36
    if (apiKey && apiKey !== 'self-hosted-no-auth') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
Copilot AI
2 hours ago
The magic string 'self-hosted-no-auth' is duplicated across multiple files (scrape.ts, search.ts, map.ts, crawl.ts). Consider extracting this to a constant in a shared configuration file to improve maintainability and prevent typos.

Copilot uses AI. Check for mistakes.
@jmagar	Reply...
packages/firecrawl-client/src/operations/crawl.ts
Comment on lines +12 to +14
function debugLog(message: string, data?: any) {
  process.stderr.write(`[FIRECRAWL-CLIENT-DEBUG] ${message} ${data ? JSON.stringify(data) : ''}\n`);
}
Copilot AI
2 hours ago
Debug logging function uses process.stderr.write directly and is only in crawl.ts. Consider moving this to a shared logging utility or removing it if it was temporary debugging code. If kept, it should be controlled by an environment variable to avoid unnecessary output in production.

Copilot uses AI. Check for mistakes.
@jmagar	Reply...
apps/mcp/shared/config/health-checks.ts
      return;
    }

    const protocol = parsedUrl.protocol === 'https:' ? https : require('http');
Copilot AI
2 hours ago
Using require('http') inline instead of importing at the top is inconsistent with the existing import http from 'http' at line 11. Use the imported http module instead of requiring it inline.

Suggested change
    const protocol = parsedUrl.protocol === 'https:' ? https : require('http');
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
Copilot uses AI. Check for mistakes.
@jmagar	Reply...
apps/mcp/shared/mcp/tools/scrape/response.ts
Comment on lines +263 to +264
  if (resultHandling === 'saveOnly' || resultHandling === 'saveAndReturn') {
    if (savedUris) {
Copilot AI
2 hours ago
[nitpick] The nested if statements create deep nesting (3 levels). Consider early returns or extracting the logic into a separate function to improve readability.

Copilot uses AI. Check for mistakes.
@jmagar	Reply...
apps/mcp/Dockerfile
WORKDIR /app/remote
# Create entrypoint script to fix volume permissions
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'chown -R nodejs:nodejs /app/resources 2>/dev/null || true' >> /entrypoint.sh && \
Copilot AI
2 hours ago
The entrypoint script silently ignores permission change failures with 2>/dev/null || true. This could hide real permission issues in production. Consider logging the failure or at least documenting why failures are expected and acceptable.

Suggested change
    echo 'chown -R nodejs:nodejs /app/resources 2>/dev/null || true' >> /entrypoint.sh && \
    echo '# Attempt to fix ownership of /app/resources for mounted volumes.' >> /entrypoint.sh && \
    echo '# If chown fails (e.g., due to permissions), log a warning but continue.' >> /entrypoint.sh && \
    echo 'chown -R nodejs:nodejs /app/resources 2>/dev/null || {' >> /entrypoint.sh && \
    echo '  echo "Warning: Failed to change ownership of /app/resources. This may be expected if the volume is mounted with root ownership." >&2' >> /entrypoint.sh && \
    echo '}' >> /entrypoint.sh && \
Copilot uses AI. Check for mistakes.
@jmagar	Reply...
docker-compose.yaml
Comment on lines +60 to +61
      context: .
      dockerfile: apps/mcp/Dockerfile
Copilot AI
2 hours ago
The build context changed from ./apps/mcp to . but the removed environment variables are not documented anywhere. Add a comment or reference to where these environment variables should now be configured (e.g., .env file, external config).

Copilot uses AI. Check for mistakes.
@jmagar	Reply...
chatgpt-codex-connector[bot]
chatgpt-codex-connector bot reviewed 2 hours ago
chatgpt-codex-connector bot
left a comment
💡 Codex Review
Here are some automated review suggestions for this pull request.

ℹ️ About Codex in GitHub
packages/firecrawl-client/src/operations/crawl.ts
Comment on lines 26 to +42
  baseUrl: string,
  options: CrawlOptions
): Promise<StartCrawlResult> {
  const response = await fetch(`${baseUrl}/crawl`, {
  debugLog('startCrawl called', { apiKey, baseUrl, targetUrl: options.url });

  // Build headers - skip Authorization for self-hosted deployments without auth
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== 'self-hosted-no-auth') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const fetchUrl = `${baseUrl}/crawl`;
  debugLog('Fetching', { url: fetchUrl, hasAuth: !!headers['Authorization'] });
@chatgpt-codex-connector
chatgpt-codex-connector bot
2 hours ago
P0 Badge Stop logging API keys in crawl debug output

The new debug logging in startCrawl writes the entire payload { apiKey, baseUrl, targetUrl } directly to stderr every time the crawler is invoked. Because the API key is included, this change will leak credentials to any runtime logs in production or CI environments, which is a serious security regression. The same call can occur even when the caller has not enabled any debug mode. Please remove the API key from the logged data or gate the logging behind an opt‑in flag that redacts secrets.

Useful? React with 👍 / 👎.

@jmagar	Reply...
apps/mcp/shared/config/health-checks.ts
Comment on lines 64 to +67
      },
    };

    const req = https.request(options, (res) => {
    const req = protocol.request(options, (res: http.IncomingMessage) => {
@chatgpt-codex-connector
chatgpt-codex-connector bot
2 hours ago
P1 Badge Use imported http module instead of require in health check

When a custom Firecrawl base URL uses the http scheme, the code attempts require('http') to choose the protocol. This file is an ES module (type: "module"), so require is undefined at runtime and the health check will crash before sending the request, breaking health checks for self‑hosted HTTP endpoints. Since the http module is already imported, use that import (parsedUrl.protocol === 'https:' ? https : http) instead of require.

Useful? React with 👍 / 👎.

@jmagar	Reply...
coderabbitai[bot]
coderabbitai bot reviewed 2 hours ago
coderabbitai bot
left a comment
Actionable comments posted: 15

Caution

Some comments are outside the diff and can’t be posted inline due to platform limitations.

⚠️ Outside diff range comments (2)
♻️ Duplicate comments (3)
📜 Review details
apps/mcp/.docs/test-results-2025-11-09.md
Comment on lines +3 to +6
**Date:** November 9, 2025
**Time:** 19:31 EST
**Task:** Task 14 - Run Isolated App Tests
**Plan:** `/compose/pulse/docs/plans/2025-01-08-monorepo-integration.md`
@coderabbitai
coderabbitai bot
2 hours ago
⚠️ Potential issue | 🟡 Minor

Verify the date inconsistency.

The document is dated November 9, 2025, but references a plan from January 8, 2025. This timeline appears reversed—either the document date should be corrected or the plan reference should reflect an earlier date (e.g., 2024-01-08).

@jmagar	Reply...
apps/mcp/Dockerfile
Comment on lines +6 to +7
# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
@coderabbitai
coderabbitai bot
2 hours ago
🧹 Nitpick | 🔵 Trivial

Consider pinning the pnpm version.

Using pnpm@latest (line 7) can lead to unexpected behavior if pnpm releases breaking changes. Consider pinning to a specific version for reproducible builds.

Apply this diff:

 # Install pnpm
-RUN corepack enable && corepack prepare pnpm@latest --activate
+RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
Based on learnings

📝 Committable suggestion
🤖 Prompt for AI Agents
@jmagar	Reply...
apps/mcp/Dockerfile
Comment on lines +22 to +24
RUN pnpm --filter @firecrawl/client run build
RUN pnpm --filter @pulsemcp/pulse-shared run build
RUN pnpm --filter @pulsemcp/pulse-remote run build
@coderabbitai
coderabbitai bot
2 hours ago
🧹 Nitpick | 🔵 Trivial

Optional: Consolidate consecutive RUN commands.

Lines 22-24 use separate RUN instructions for building packages. While this provides better layer caching during development, consolidating them would reduce the final image layers.

-# Build packages
-RUN pnpm --filter @firecrawl/client run build
-RUN pnpm --filter @pulsemcp/pulse-shared run build
-RUN pnpm --filter @pulsemcp/pulse-remote run build
+# Build packages
+RUN pnpm --filter @firecrawl/client run build && \
+    pnpm --filter @pulsemcp/pulse-shared run build && \
+    pnpm --filter @pulsemcp/pulse-remote run build
📝 Committable suggestion
🧰 Tools
🤖 Prompt for AI Agents
@jmagar	Reply...
apps/mcp/Dockerfile
Comment on lines +53 to +56
# Create symlink for remote to access shared package
# The built JS is in dist/remote/, so the symlink must be there too
RUN cd /app/apps/mcp/remote/dist/remote && \
    ln -s ../../../shared/dist shared
@coderabbitai
coderabbitai bot
2 hours ago
🧹 Nitpick | 🔵 Trivial

Consider using WORKDIR instead of cd in RUN command.

Hadolint flags the use of cd within a RUN command (DL3003). While functional, using WORKDIR is more explicit and follows Docker best practices.

-# Create symlink for remote to access shared package
-# The built JS is in dist/remote/, so the symlink must be there too
-RUN cd /app/apps/mcp/remote/dist/remote && \
-    ln -s ../../../shared/dist shared
+# Create symlink for remote to access shared package
+# The built JS is in dist/remote/, so the symlink must be there too
+WORKDIR /app/apps/mcp/remote/dist/remote
+RUN ln -s ../../../shared/dist shared
+WORKDIR /app
📝 Committable suggestion
🧰 Tools
🤖 Prompt for AI Agents
@jmagar	Reply...
apps/mcp/Dockerfile
Comment on lines +63 to +67
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'chown -R nodejs:nodejs /app/resources 2>/dev/null || true' >> /entrypoint.sh && \
    echo 'exec su-exec nodejs "$@"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    apk add --no-cache su-exec
@coderabbitai
coderabbitai bot
2 hours ago
🧹 Nitpick | 🔵 Trivial

Pin the su-exec package version and consider extracting the entrypoint script.

Line 63 installs su-exec without version pinning, which can lead to non-reproducible builds. Additionally, the inline entrypoint script could be extracted to a separate file for better maintainability.

Option 1 (Minimal): Pin the su-exec version

     echo 'exec su-exec nodejs "$@"' >> /entrypoint.sh && \
     chmod +x /entrypoint.sh && \
-    apk add --no-cache su-exec
+    apk add --no-cache su-exec=0.2-r3
Option 2 (Better): Extract to a separate file

Create apps/mcp/entrypoint.sh:

#!/bin/sh
chown -R nodejs:nodejs /app/resources 2>/dev/null || true
exec su-exec nodejs "$@"
Then update the Dockerfile:

-# Create entrypoint script to fix volume permissions
-RUN echo '#!/bin/sh' > /entrypoint.sh && \
-    echo 'chown -R nodejs:nodejs /app/resources 2>/dev/null || true' >> /entrypoint.sh && \
-    echo 'exec su-exec nodejs "$@"' >> /entrypoint.sh && \
-    chmod +x /entrypoint.sh && \
-    apk add --no-cache su-exec
+# Install su-exec and copy entrypoint
+RUN apk add --no-cache su-exec=0.2-r3
+COPY apps/mcp/entrypoint.sh /entrypoint.sh
+RUN chmod +x /entrypoint.sh
As per coding guidelines

🧰 Tools
🤖 Prompt for AI Agents
@jmagar	Reply...
5 hidden conversations
Load more…
packages/firecrawl-client/src/operations/crawl.ts
Comment on lines +11 to +14
// Simple stderr logging for debugging (bypasses any log filtering)
function debugLog(message: string, data?: any) {
  process.stderr.write(`[FIRECRAWL-CLIENT-DEBUG] ${message} ${data ? JSON.stringify(data) : ''}\n`);
}
@coderabbitai
coderabbitai bot
2 hours ago
⚠️ Potential issue | 🟠 Major

Debug utility lacks production-ready controls.

The debugLog utility writes unconditionally to stderr with no way to disable it at runtime. This can clutter production logs and, more critically, is used at line 29 to log sensitive data like API keys.

Consider either:

Removing debug logs before production, or
Adding an environment variable check (e.g., DEBUG=firecrawl-client) to conditionally enable logging
-// Simple stderr logging for debugging (bypasses any log filtering)
-function debugLog(message: string, data?: any) {
-  process.stderr.write(`[FIRECRAWL-CLIENT-DEBUG] ${message} ${data ? JSON.stringify(data) : ''}\n`);
-}
+// Simple stderr logging for debugging (bypasses any log filtering)
+function debugLog(message: string, data?: any) {
+  if (process.env.DEBUG?.includes('firecrawl-client')) {
+    process.stderr.write(`[FIRECRAWL-CLIENT-DEBUG] ${message} ${data ? JSON.stringify(data) : ''}\n`);
+  }
+}
📝 Committable suggestion
🤖 Prompt for AI Agents
@jmagar	Reply...
packages/firecrawl-client/src/operations/crawl.ts
  options: CrawlOptions
): Promise<StartCrawlResult> {
  const response = await fetch(`${baseUrl}/crawl`, {
  debugLog('startCrawl called', { apiKey, baseUrl, targetUrl: options.url });
@coderabbitai
coderabbitai bot
2 hours ago
⚠️ Potential issue | 🔴 Critical

Critical: API key exposed in debug logs.

Logging the apiKey in plain text is a critical security vulnerability. API keys should never be written to logs, as they may be collected by log aggregation systems, error reporting tools, or visible in container logs.

Apply this diff to remove sensitive data from logs:

-  debugLog('startCrawl called', { apiKey, baseUrl, targetUrl: options.url });
+  debugLog('startCrawl called', { baseUrl, targetUrl: options.url });
📝 Committable suggestion
🤖 Prompt for AI Agents
@jmagar	Reply...
packages/firecrawl-client/src/operations/crawl.ts
Comment on lines +31 to +39
  // Build headers - skip Authorization for self-hosted deployments without auth
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== 'self-hosted-no-auth') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
@coderabbitai
coderabbitai bot
2 hours ago
🧹 Nitpick | 🔵 Trivial

Extract duplicated header-building logic.

The conditional Authorization header logic is duplicated across all three functions. Consider extracting it to a shared helper function to follow DRY principles and improve maintainability.

Add a helper function at the top of the file:

function buildHeaders(apiKey: string, includeContentType = false): Record<string, string> {
  const headers: Record<string, string> = {};
  
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== 'self-hosted-no-auth') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  return headers;
}
Then simplify each function:

 // In startCrawl:
-  const headers: Record<string, string> = {
-    'Content-Type': 'application/json',
-  };
-
-  // Only add Authorization header if API key is not a self-hosted placeholder
-  if (apiKey && apiKey !== 'self-hosted-no-auth') {
-    headers['Authorization'] = `Bearer ${apiKey}`;
-  }
+  const headers = buildHeaders(apiKey, true);

 // In getCrawlStatus and cancelCrawl:
-  const headers: Record<string, string> = {};
-
-  // Only add Authorization header if API key is not a self-hosted placeholder
-  if (apiKey && apiKey !== 'self-hosted-no-auth') {
-    headers['Authorization'] = `Bearer ${apiKey}`;
-  }
+  const headers = buildHeaders(apiKey);
Also applies to: 77-83, 117-123

🤖 Prompt for AI Agents
@jmagar	Reply...
packages/firecrawl-client/src/operations/crawl.ts
  };

  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== 'self-hosted-no-auth') {
@coderabbitai
coderabbitai bot
2 hours ago
🛠️ Refactor suggestion | 🟠 Major

🧩 Analysis chain
Extract magic string to a shared constant for consistency across packages.

The string 'self-hosted-no-auth' appears 13+ times across multiple packages and modules (crawl.ts, map.ts, scrape.ts, search.ts, health-checks.ts, registration.ts, service-status.ts, and test files). Extract it to a shared constants file to prevent typos and ensure consistency in self-hosted deployment detection.

Suggested location: packages/firecrawl-client/src/constants.ts (or similar shared constants module)

export const SELF_HOSTED_NO_AUTH = 'self-hosted-no-auth';
Then update all occurrences across both packages/firecrawl-client and apps/mcp to import and use this constant.

🤖 Prompt for AI Agents
@jmagar	Reply...
packages/firecrawl-client/src/operations/map.ts
  };

  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== 'self-hosted-no-auth') {
@coderabbitai
coderabbitai bot
2 hours ago
🛠️ Refactor suggestion | 🟠 Major

🧩 Analysis chain
Extract magic string 'self-hosted-no-auth' to a shared constant.

The string 'self-hosted-no-auth' is repeated 6 times across 4 operation files (search.ts, scrape.ts, map.ts, crawl.ts). Extract it to a named constant in packages/firecrawl-client/src/types.ts to prevent typos and improve maintainability.

Add to types.ts:

export const SELF_HOSTED_NO_AUTH = 'self-hosted-no-auth';
Update all occurrences in:

packages/firecrawl-client/src/operations/search.ts:31
packages/firecrawl-client/src/operations/scrape.ts:34
packages/firecrawl-client/src/operations/map.ts:36
packages/firecrawl-client/src/operations/crawl.ts:37, 81, 121
Change each instance from:

if (apiKey && apiKey !== 'self-hosted-no-auth') {
to:

if (apiKey && apiKey !== SELF_HOSTED_NO_AUTH) {
🤖 Prompt for AI Agents
@jmagar	Reply...
claude added 26 commits 2 hours ago
@claude
docs: add comprehensive webhook troubleshooting guide and logging doc… 
c293dd0
@claude
feat(webhook): add enable_worker configuration setting 
425fed2
@claude
feat(webhook): add background worker thread manager 
212f012
@claude
feat(webhook): integrate background worker into FastAPI lifespan 
366782b
@claude
refactor(webhook): remove BM25 index reload logic 
f90c408
@claude
refactor(compose): remove separate webhook worker container 
bc09290
@claude
docs: add WEBHOOK_ENABLE_WORKER to environment example 
3c029c4
@claude
docs(webhook): update README for combined worker/API architecture 
40cc6a0
@claude
docs(webhook): deprecate standalone worker module 
11f6bdb
@claude
docs: update services-ports for combined webhook service 
0c1fe6a
@claude
docs: update troubleshooting guide for combined worker/API 
b1e0aae
@claude
test(webhook): add end-to-end integration test 
a1a06e5
@claude
feat: consolidate environment variables to root .env 
f811286
@claude
docs: add AGENTS.md symlinks for Open Standards compatibility 
fd19791
@claude
refactor: move session logs to .docs/sessions/ and ignore .docs/tmp 
e01f43c
@claude
chore: remove stale npm lockfiles from pnpm workspace 
6e83026
@claude
docs: correct Python version requirement to 3.12+ 
2ef5c07
@claude
docs: create deployment log tracking file 
d50269e
@claude
docs: correct developer workflow instructions 
bb6b70c
@claude
docs: create comprehensive README for firecrawl-client package 
dfecc3d
@claude
feat: standardize ports to 50100-50110 range 
89d6e64
@claude
docs(web): update README for monorepo integration 
142185a
@claude
feat: add external services with Docker context deployment 
f57b84a
@claude
refactor: migrate from Makefiles to unified pnpm scripts 
a0be714
@claude
docs: add monorepo cleanup execution summary 
7e93b5b
@claude
chore: cleanup session logs and consolidate documentation 
1e65d11
@claude
docs: fix monorepo structure diagram 
cabb789
coderabbitai[bot]
coderabbitai bot reviewed 44 minutes ago
coderabbitai bot
left a comment
Actionable comments posted: 19

Caution

Some comments are outside the diff and can’t be posted inline due to platform limitations.

⚠️ Outside diff range comments (1)
📜 Review details
.env.example
Comment on lines 154 to +166
# Webhook Configuration
SELF_HOSTED_WEBHOOK_URL=http://localhost:52100/api/webhook/firecrawl
# IMPORTANT: Use internal Docker network URL for webhook delivery
# Format: http://<container-name>:<port>/api/webhook/firecrawl
# ❌ DON'T: https://external-domain.com/... (causes 502 errors)
# ✅ DO: http://firecrawl_webhook:52100/api/webhook/firecrawl
SELF_HOSTED_WEBHOOK_URL=http://localhost:50108/api/webhook/firecrawl

# HMAC secret for webhook signature verification (min 16 chars, must match WEBHOOK_SECRET)
SELF_HOSTED_WEBHOOK_HMAC_SECRET=your-webhook-hmac-secret

# Allow webhooks to internal Docker network addresses (bypasses SSRF protection)
# Required for internal Docker communication, safe for trusted networks
ALLOW_LOCAL_WEBHOOKS=true
@coderabbitai
coderabbitai bot
44 minutes ago
⚠️ Potential issue | 🟠 Major

Fix inconsistency between webhook URL guidance and example value.

The comments emphasize using internal Docker network URLs and explicitly show http://firecrawl_webhook:52100/api/webhook/firecrawl as the correct format, but the example value uses http://localhost:50108/api/webhook/firecrawl.

Apply this diff to align the example with the guidance:

 # Webhook Configuration
 # IMPORTANT: Use internal Docker network URL for webhook delivery
 # Format: http://<container-name>:<port>/api/webhook/firecrawl
 # ❌ DON'T: https://external-domain.com/... (causes 502 errors)
 # ✅ DO: http://firecrawl_webhook:52100/api/webhook/firecrawl
-SELF_HOSTED_WEBHOOK_URL=http://localhost:50108/api/webhook/firecrawl
+SELF_HOSTED_WEBHOOK_URL=http://firecrawl_webhook:52100/api/webhook/firecrawl
Note: The port should be the internal container port (52100), not the external mapped port (50108), as this URL is used for internal Docker network communication.

🤖 Prompt for AI Agents
@jmagar	Reply...
.env.example
Comment on lines +175 to +189
# -----------------
# External Services (GPU Machine)
# -----------------
# These services run on a separate machine with GPU support.
# Deploy using: pnpm services:external:up
# Update URLs to point to your GPU-enabled host (use Tailscale hostname or IP).

# Text Embeddings Inference
TEI_PORT=50200
WEBHOOK_TEI_URL=http://localhost:50200

# Qdrant Vector Database
QDRANT_HTTP_PORT=50201
QDRANT_GRPC_PORT=50202
WEBHOOK_QDRANT_URL=http://localhost:50201
@coderabbitai
coderabbitai bot
44 minutes ago
⚠️ Potential issue | 🟠 Major

Fix duplicate environment variable keys.

The external services section duplicates WEBHOOK_TEI_URL and WEBHOOK_QDRANT_URL, which are already defined in the Webhook Bridge section (lines 113, 118). When both sections are uncommented, the last value wins, creating ambiguity and potential misconfiguration.

Consider one of these approaches:

Option 1: Use a separate .env.external file

-# -----------------
-# External Services (GPU Machine)
-# -----------------
-# These services run on a separate machine with GPU support.
-# Deploy using: pnpm services:external:up
-# Update URLs to point to your GPU-enabled host (use Tailscale hostname or IP).
-
-# Text Embeddings Inference
-TEI_PORT=50200
-WEBHOOK_TEI_URL=http://localhost:50200
-
-# Qdrant Vector Database
-QDRANT_HTTP_PORT=50201
-QDRANT_GRPC_PORT=50202
-WEBHOOK_QDRANT_URL=http://localhost:50201
Then create a separate .env.external.example file for GPU machine overrides.

Option 2: Comment out the external services section by default

Add clear documentation that users should uncomment and update these values when deploying external services, and comment out the internal defaults.

Option 3: Use distinct variable names

Use WEBHOOK_TEI_URL_EXTERNAL and WEBHOOK_QDRANT_URL_EXTERNAL for the external services, with application logic to prefer external URLs when set.

Committable suggestion skipped: line range outside the PR's diff.

🧰 Tools
🤖 Prompt for AI Agents
@jmagar	Reply...
AGENTS.md
@@ -0,0 +1 @@
CLAUDE.md
@coderabbitai
coderabbitai bot
44 minutes ago
🧹 Nitpick | 🔵 Trivial

Add a heading to improve markdown structure.

The file contains only a filename reference without context. Adding a heading would improve clarity and satisfy markdown best practices.

Apply this diff:

+# Agent Documentation
+
+This file lists available agent documentation:
+
 CLAUDE.md
Alternatively, if this is meant to be a simple machine-readable list without markdown formatting, consider renaming to AGENTS.txt or AGENTS.list.

🧰 Tools
🤖 Prompt for AI Agents
@jmagar	Reply...
apps/mcp/shared/mcp/tools/crawl/response.ts
Comment on lines +28 to +34
    // Determine if crawl is truly complete (job done AND no more data to paginate)
    const isTrulyComplete = statusResult.status === 'completed' && !statusResult.next;
    const statusLabel = isTrulyComplete
      ? 'Completed'
      : statusResult.status === 'completed' && statusResult.next
        ? 'Completed (pagination required)'
        : statusResult.status.charAt(0).toUpperCase() + statusResult.status.slice(1);
@coderabbitai
coderabbitai bot
44 minutes ago
🧹 Nitpick | 🔵 Trivial

LGTM! Clear completion and pagination logic.

The runtime classification correctly distinguishes between truly complete crawls and those requiring pagination. The three-branch conditional for statusLabel appropriately handles all cases.

Optionally, consider extracting this status label derivation into a separate helper function for improved testability:

+function deriveStatusLabel(status: string, hasNext: boolean): string {
+  const isTrulyComplete = status === 'completed' && !hasNext;
+  return isTrulyComplete
+    ? 'Completed'
+    : status === 'completed' && hasNext
+      ? 'Completed (pagination required)'
+      : status.charAt(0).toUpperCase() + status.slice(1);
+}
+
 export function formatCrawlResponse(
   result: StartCrawlResult | CrawlStatusResult | CancelResult
 ): CallToolResult {
   // ...
-    const isTrulyComplete = statusResult.status === 'completed' && !statusResult.next;
-    const statusLabel = isTrulyComplete
-      ? 'Completed'
-      : statusResult.status === 'completed' && statusResult.next
-        ? 'Completed (pagination required)'
-        : statusResult.status.charAt(0).toUpperCase() + statusResult.status.slice(1);
+    const isTrulyComplete = statusResult.status === 'completed' && !statusResult.next;
+    const statusLabel = deriveStatusLabel(statusResult.status, !!statusResult.next);
📝 Committable suggestion
🤖 Prompt for AI Agents
@jmagar	Reply...
apps/mcp/shared/mcp/tools/crawl/response.ts

    if (statusResult.next) {
      statusText += `\n\nPagination URL: ${statusResult.next}`;
      statusText += `\n\n⚠️ Data pagination required!\nNext batch URL: ${statusResult.next}\n\nThe crawl job has completed, but the results are larger than 10MB.\nUse the pagination URL to retrieve the next batch of data.`;
@coderabbitai
coderabbitai bot
44 minutes ago
⚠️ Potential issue | 🟡 Minor

Consider extracting the hardcoded 10MB limit.

The pagination message hardcodes "10MB" as the result size threshold. If this limit changes in the Firecrawl API, it will need to be updated here.

Consider extracting this into a constant at the file or module level:

+const PAGINATION_THRESHOLD_MB = 10;
+
 export function formatCrawlResponse(
   result: StartCrawlResult | CrawlStatusResult | CancelResult
 ): CallToolResult {
   // ...
   if (statusResult.next) {
-    statusText += `\n\n⚠️ Data pagination required!\nNext batch URL: ${statusResult.next}\n\nThe crawl job has completed, but the results are larger than 10MB.\nUse the pagination URL to retrieve the next batch of data.`;
+    statusText += `\n\n⚠️ Data pagination required!\nNext batch URL: ${statusResult.next}\n\nThe crawl job has completed, but the results are larger than ${PAGINATION_THRESHOLD_MB}MB.\nUse the pagination URL to retrieve the next batch of data.`;
   }
Alternatively, verify if this limit is documented in the Firecrawl API specifications and consider adding a comment referencing where this value is defined.

Committable suggestion skipped: line range outside the PR's diff.

🤖 Prompt for AI Agents
@jmagar	Reply...
9 hidden conversations
Load more…
apps/webhook/tests/unit/test_worker_thread.py
Comment on lines +38 to +49
def test_worker_thread_manager_does_not_start_twice():
    """WorkerThreadManager cannot be started twice."""
    from app.worker_thread import WorkerThreadManager

    manager = WorkerThreadManager()
    manager.start()

    # Trying to start again should raise
    with pytest.raises(RuntimeError, match="Worker thread already running"):
        manager.start()

    manager.stop()
@coderabbitai
coderabbitai bot
44 minutes ago
⚠️ Potential issue | 🟠 Major

Add Redis mock for consistency.

This test also needs Redis mocking to prevent connection attempts.

Apply this diff:

 def test_worker_thread_manager_does_not_start_twice():
     """WorkerThreadManager cannot be started twice."""
     from app.worker_thread import WorkerThreadManager
+    from unittest.mock import Mock, patch
 
     manager = WorkerThreadManager()
-    manager.start()
-
-    # Trying to start again should raise
-    with pytest.raises(RuntimeError, match="Worker thread already running"):
-        manager.start()
-
-    manager.stop()
+    
+    with patch('app.worker_thread.Redis') as mock_redis:
+        mock_redis.from_url.return_value = Mock()
+        
+        manager.start()
+        
+        # Trying to start again should raise
+        with pytest.raises(RuntimeError, match="Worker thread already running"):
+            manager.start()
+        
+        manager.stop()
📝 Committable suggestion
@jmagar	Reply...
docs/deployment-log.md
Comment on lines +1 to +84
# Deployment Log

This file tracks all deployments and significant infrastructure changes to the Pulse monorepo.

Format: `YYYY-MM-DD HH:MM:SS | Service | Action | Port | Notes`

---

## 2025-11-10

### 15:30:00 | Documentation | Cleanup | N/A
- Moved all session logs to .docs/sessions/
- Added .docs/tmp/ to .gitignore
- Removed stale npm lockfiles from pnpm workspace
- Created AGENTS.md symlinks for Open Standards compatibility

### 15:00:00 | Configuration | Environment Variables | N/A
- Consolidated environment variables to root .env
- Removed local .env files from apps/mcp and apps/webhook
- Updated .env.example with single source of truth documentation
- Added environment variable management section to CLAUDE.md

### 10:30:00 | All Services | Port Standardization | 50100-50110
- Migrated all services to sequential high-numbered ports
- Playwright: 50100
- Firecrawl: 50102
- Redis: 50104
- PostgreSQL: 50105
- MCP: 50107
- Webhook: 50108

### 10:45:00 | External Services | Documentation | 50200-50202
- Created docker-compose.external.yaml for TEI and Qdrant
- Documented GPU requirements and external hosting
- TEI: 50200, Qdrant: 50201-50202

---

## 2025-11-09

### 20:54:00 | All Services | Cleanup | Various
- Removed apps/api directory (using official Firecrawl image)
- Consolidated Docker compose configuration
- Removed standalone compose files

### 19:30:00 | Integration Testing | Complete | N/A
- All services verified working together
- Database schema migrations tested
- Health checks passing

---

## 2025-11-08

### 23:28:00 | Security | Audit | N/A
- Completed security audit for monorepo dependencies
- pnpm audit: 0 vulnerabilities
- pip-audit: 0 vulnerabilities

### 16:00:00 | MCP Server | Environment Migration | 3060
- Migrated to namespaced MCP_* environment variables
- Backward compatibility with legacy variable names maintained

---

## Instructions

When deploying changes:

1. Add entry with timestamp in EST (HH:MM:SS | MM/DD/YYYY)
2. Include service name, action type, port (if applicable)
3. Brief notes about what changed
4. Commit this file with the deployment

Action types:
- Deploy: New deployment
- Update: Configuration change
- Restart: Service restart
- Migrate: Database migration
- Rollback: Revert to previous version
- Scale: Resource adjustment
- Cleanup: Remove unused resources
- Documentation: Documentation updates
- Security: Security-related changes
@coderabbitai
coderabbitai bot
44 minutes ago
⚠️ Potential issue | 🟡 Minor

Fix markdown formatting for consistency.

The deployment log content is well-organized and useful, but has minor markdown linting issues. Static analysis reports missing blank lines around headings (lines 11, 17, 23, 32, 41, 46, 55, 60).

Add blank lines before heading entries:

 ## 2025-11-10
 
 ### 15:30:00 | Documentation | Cleanup | N/A
+
 - Moved all session logs to .docs/sessions/
 - Added .docs/tmp/ to .gitignore
 - Removed stale npm lockfiles from pnpm workspace
 - Created AGENTS.md symlinks for Open Standards compatibility
 
 ### 15:00:00 | Configuration | Environment Variables | N/A
+
 - Consolidated environment variables to root .env
Apply similar formatting throughout the file for consistency.

📝 Committable suggestion
🧰 Tools
🤖 Prompt for AI Agents
@jmagar	Reply...
docs/external-services.md
Comment on lines +1 to +256
# External Services (GPU-Required)

This document describes the external GPU-dependent services (TEI and Qdrant) deployed using Docker contexts.

## Services

### Text Embeddings Inference (TEI)

**Purpose:** Generate text embeddings for semantic search
**Model:** Qwen/Qwen3-Embedding-0.6B (1024 dimensions)
**Port:** 50200 (HTTP)
**GPU Required:** Yes (NVIDIA with CUDA support)

### Qdrant Vector Database

**Purpose:** Store and search document embeddings
**Ports:**
- 50201 (HTTP API)
- 50202 (gRPC)
**GPU Required:** No, but runs on same machine as TEI for network proximity

## Setup with Docker Context

### One-Time Setup

1. **Create Docker context pointing to GPU machine:**

```bash
# Using SSH (recommended)
docker context create gpu-machine --docker "host=ssh://user@gpu-machine-hostname"

# Or using TCP (if Docker API is exposed)
docker context create gpu-machine --docker "host=tcp://gpu-machine-ip:2375"

# Verify context
docker context ls
```

2. **Test connection:**

```bash
docker --context gpu-machine ps
```

### Deploy External Services

Use the provided pnpm scripts to deploy to the GPU context:

```bash
# Deploy external services to GPU machine
pnpm services:external:up

# Check status
pnpm services:external:ps

# View logs
pnpm services:external:logs

# Stop services
pnpm services:external:down

# Restart services
pnpm services:external:restart
```

### Manual Deployment

If you prefer manual control:

```bash
# Deploy to GPU context
docker --context gpu-machine compose -f docker-compose.external.yaml up -d

# Check status
docker --context gpu-machine compose -f docker-compose.external.yaml ps

# View logs
docker --context gpu-machine compose -f docker-compose.external.yaml logs -f

# Stop services
docker --context gpu-machine compose -f docker-compose.external.yaml down
```

## Environment Variables

The external services read from the same `.env` file. Docker context automatically syncs the environment.

Update your `.env` with the GPU machine's accessible IP/hostname:

```bash
# External Service URLs (use GPU machine's network-accessible address)
WEBHOOK_TEI_URL=http://gpu-machine-ip:50200
WEBHOOK_QDRANT_URL=http://gpu-machine-ip:50201

# Or if using Tailscale (recommended)
WEBHOOK_TEI_URL=http://tailscale-hostname:50200
WEBHOOK_QDRANT_URL=http://tailscale-hostname:50201
```

## Network Configuration

- External services must be accessible from the main Pulse stack
- Ensure firewall allows incoming connections on ports 50200-50202
- **Recommended:** Use Tailscale for secure mesh networking between machines
- **Alternative:** Use VPN or configure firewall rules

## Health Checks

### TEI
```bash
curl http://gpu-machine-ip:50200/health
# Expected: {"status":"ok"}
```

### Qdrant
```bash
curl http://gpu-machine-ip:50201/collections
# Expected: {"result":{"collections":[]}}
```

## Troubleshooting

### Context connection fails

```bash
# Verify SSH access
ssh user@gpu-machine-hostname

# Check Docker is running on remote
ssh user@gpu-machine-hostname "docker ps"

# Recreate context
docker context rm gpu-machine
docker context create gpu-machine --docker "host=ssh://user@gpu-machine-hostname"
```

### Services won't start

```bash
# Check GPU availability on remote
docker --context gpu-machine run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Check logs
pnpm services:external:logs
```

### Network connectivity issues

```bash
# Test from main Pulse machine
curl http://gpu-machine-ip:50200/health
curl http://gpu-machine-ip:50201/collections

# Check firewall on GPU machine
sudo ufw status
sudo ufw allow 50200:50202/tcp

# Check if services are listening
docker --context gpu-machine exec firecrawl_tei curl localhost:80/health
docker --context gpu-machine exec firecrawl_qdrant curl localhost:6333/collections
```

## Local Development (Without GPU)

For development without a GPU machine:

1. **CPU-only TEI:** Remove GPU requirements from `docker-compose.external.yaml`
   ```yaml
   # Comment out or remove the deploy section
   # deploy:
   #   resources:
   #     reservations:
   #       devices:
   #         - driver: nvidia
   #           count: 1
   #           capabilities: [gpu]
   ```

2. **Mock services:** Use stub responses for development (see webhook README)

3. **Shared dev instance:** Point to a team-shared GPU machine

See main [README](../README.md) for development configuration.

## Port Allocation

External services use the 50200-50299 range:

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| TEI | 50200 | HTTP | Text embeddings API |
| Qdrant | 50201 | HTTP | Vector database HTTP API |
| Qdrant | 50202 | gRPC | Vector database gRPC API |

## Security Considerations

- **SSH Key Authentication:** Use key-based SSH for Docker contexts (not passwords)
- **Firewall Rules:** Only allow connections from known IPs (Pulse stack machines)
- **TLS/HTTPS:** Consider using nginx reverse proxy with TLS for production
- **Tailscale:** Strongly recommended for secure mesh networking without firewall complexity
- **Environment Variables:** Never commit `.env` with production URLs/credentials

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│ Main Pulse Stack (Local Machine)                   │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│ │  Firecrawl  │  │  MCP Server │  │   Webhook   │ │
│ │     API     │  │             │  │   Bridge    │ │
│ └─────────────┘  └─────────────┘  └──────┬──────┘ │
│                                           │         │
└───────────────────────────────────────────┼─────────┘
                                            │
                           Network (Tailscale/VPN/Public)
                                            │
┌───────────────────────────────────────────┼─────────┐
│ GPU Machine (Remote)                      │         │
│                                           ▼         │
│                            ┌──────────────────────┐ │
│                            │   Webhook Bridge     │ │
│                            │   (needs TEI/Qdrant) │ │
│                            └──────┬──────┬────────┘ │
│                                   │      │           │
│                    ┌──────────────┘      └────────┐ │
│                    ▼                              ▼ │
│         ┌─────────────────┐          ┌──────────────┐
│         │       TEI       │          │    Qdrant    │
│         │  (GPU-enabled)  │          │ (Vector DB)  │
│         └─────────────────┘          └──────────────┘
└─────────────────────────────────────────────────────┘
```

## Benefits of Docker Context Approach

1. **Centralized Management:** Deploy from main repo without manual file copying
2. **Unified Workflow:** Same pnpm scripts manage all infrastructure
3. **Environment Sync:** Single `.env` file for all services
4. **Version Control:** External services config tracked in git
5. **Team Collaboration:** Everyone uses same deployment process
6. **Easy Rollback:** Git history tracks all deployment changes

## Alternative: Manual Deployment

If Docker contexts don't work for your setup, you can manually copy files to the GPU machine:

```bash
# On GPU machine
git clone <repo-url>
cd pulse
cp .env.example .env
# Edit .env with local values
docker compose -f docker-compose.external.yaml up -d
```

However, this loses the benefits of centralized management and requires manual syncing.
@coderabbitai
coderabbitai bot
44 minutes ago
⚠️ Potential issue | 🟡 Minor

Address minor markdown formatting issues.

The documentation is comprehensive and well-organized. However, there are a few minor markdown linting issues that should be fixed for consistency:

Line 39: Ordered list numbering (use 2. instead of maintaining 1.)
Lines 109-119: Missing blank lines around headings and fenced code blocks
Line 168: Missing blank line around fenced code
Note: The ASCII diagram at line 205 correctly lacks a language specifier since it's not code.

Example fixes:

 2. **Test connection:**
+
 ```bash
 docker --context gpu-machine ps
Health Checks
TEI
curl http://gpu-machine-ip:50200/health
# Expected: {"status":"ok"}
Qdrant
curl http://gpu-machine-ip:50201/collections
# Expected: {"result":{"collections":[]}}

<details>
<summary>🧰 Tools</summary>

<details>
<summary>🪛 markdownlint-cli2 (0.18.1)</summary>

39-39: Ordered list item prefix
Expected: 1; Actual: 2; Style: 1/1/1

(MD029, ol-prefix)

---

109-109: Headings should be surrounded by blank lines
Expected: 1; Actual: 0; Below

(MD022, blanks-around-headings)

---

110-110: Fenced code blocks should be surrounded by blank lines

(MD031, blanks-around-fences)

---

115-115: Headings should be surrounded by blank lines
Expected: 1; Actual: 0; Below

(MD022, blanks-around-headings)

---

116-116: Fenced code blocks should be surrounded by blank lines

(MD031, blanks-around-fences)

---

168-168: Fenced code blocks should be surrounded by blank lines

(MD031, blanks-around-fences)

---

205-205: Fenced code blocks should have a language specified

(MD040, fenced-code-language)

</details>

</details>

<details>
<summary>🤖 Prompt for AI Agents</summary>

In docs/external-services.md (lines 1-256): fix minor Markdown lint
issues—change the ordered list numbering at around line 39 to use sequential
numbers (e.g., replace repeated "1." with "2." etc.), and add missing blank
lines before and after the headings and fenced code blocks around lines 109-119
and around line 168 so each heading is separated from surrounding text and each
fenced code block is preceded and followed by a blank line; apply the same
blank-line convention used elsewhere in the file to keep formatting consistent.


</details>

<!-- This is an auto-generated comment by CodeRabbit -->
@jmagar	Reply...
package.json
Comment on lines +44 to +48
    "services:external:up": "docker --context gpu-machine compose -f docker-compose.external.yaml up -d",
    "services:external:down": "docker --context gpu-machine compose -f docker-compose.external.yaml down",
    "services:external:ps": "docker --context gpu-machine compose -f docker-compose.external.yaml ps",
    "services:external:logs": "docker --context gpu-machine compose -f docker-compose.external.yaml logs -f",
    "services:external:restart": "pnpm services:external:down && pnpm services:external:up"
@coderabbitai
coderabbitai bot
44 minutes ago
🧹 Nitpick | 🔵 Trivial

Document the gpu-machine Docker context requirement.

The external services scripts assume a Docker context named gpu-machine exists. This is a deployment-specific configuration that should be documented for users.

Consider adding documentation about setting up the gpu-machine Docker context:

In the main README.md or a deployment guide
In the comments at the top of docker-compose.external.yaml
In the CLAUDE.md deployment section
The documentation should explain:

How to create the context: docker context create gpu-machine --docker "host=ssh://user@gpu-host"
When the external services are needed (GPU-accelerated embeddings and vector search)
How to verify the context: docker context ls
Would you like me to generate a documentation section for this?

🤖 Prompt for AI Agents
@jmagar	Reply...
README.md
Comment on lines +319 to 325
- Firecrawl API: `http://localhost:50102`
- MCP Server: `http://localhost:50107`
- Webhook Bridge: `http://localhost:50108`
- Redis: `redis://localhost:50104`
- PostgreSQL: `postgresql://localhost:50105/firecrawl_db`
- Playwright: `http://localhost:4302`

@coderabbitai
coderabbitai bot
44 minutes ago
⚠️ Potential issue | 🟡 Minor

Playwright external port still references old port number (4302).

Line 324 shows Playwright at 4302, but the standardization plan (and lines 176-178) map it to 50100:

 **External (Host machine)**:
-Playwright: `http://localhost:4302`
+Playwright: `http://localhost:50100`
This is an oversight during port migration.