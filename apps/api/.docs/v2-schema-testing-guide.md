# Testing the Firecrawl v2 OpenAPI Schema

## ✅ Validation Results

### 1. Swagger CLI Validation
```bash
swagger-cli validate openapi-v2.json
```
**Result:** ✅ `openapi-v2.json is valid`

### 2. Redocly Linting
```bash
redocly lint openapi-v2.json
```
**Result:** ✅ Valid with 19 style warnings (non-blocking)

### 3. Bundle Test
```bash
redocly bundle openapi-v2.json -o openapi-v2-bundled.json
```
**Result:** ✅ All references resolved successfully

### 4. Coverage Validation
```bash
node /tmp/test_v2_schema.js
```
**Result:** ✅ All 21 endpoints documented, all schemas present

---

## 📄 Generated Files

1. **`openapi-v2.json`** - Complete OpenAPI 3.0 schema for v2 API
2. **`.docs/v2-api-docs.html`** - Interactive HTML documentation (362 KB)
3. **`.docs/v2-schema-validation-report.md`** - Detailed validation report
4. **`openapi-v2-bundled.json`** - Bundled schema with resolved references

---

## 🧪 Testing Methods

### Method 1: View Interactive Documentation

Open the generated HTML file in your browser:

```bash
open .docs/v2-api-docs.html
# or
firefox .docs/v2-api-docs.html
# or
xdg-open .docs/v2-api-docs.html
```

This provides:
- Complete API reference with examples
- Request/response schemas
- Authentication details
- Try-it-out functionality (with your API key)

### Method 2: Generate Mock Server

Create a mock API server for testing:

```bash
# Install Prism (API mocking)
npm install -g @stoplight/prism-cli

# Start mock server
prism mock openapi-v2.json --port 4010

# Test against mock
curl http://localhost:4010/v2/scrape \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Method 3: Generate Client SDKs

Generate type-safe clients from the schema:

**TypeScript Client:**
```bash
npx @openapitools/openapi-generator-cli generate \
  -i openapi-v2.json \
  -g typescript-fetch \
  -o ./sdk/typescript \
  --additional-properties=npmName=firecrawl-v2-client,supportsES6=true
```

**Python Client:**
```bash
npx @openapitools/openapi-generator-cli generate \
  -i openapi-v2.json \
  -g python \
  -o ./sdk/python \
  --additional-properties=packageName=firecrawl_v2
```

**Go Client:**
```bash
npx @openapitools/openapi-generator-cli generate \
  -i openapi-v2.json \
  -g go \
  -o ./sdk/go
```

### Method 4: Compare with Official Firecrawl

Test the schema matches production behavior:

```bash
# Set your API key
export FIRECRAWL_API_KEY="fc-YOUR_KEY_HERE"

# Test scrape endpoint
curl -X POST https://api.firecrawl.dev/v2/scrape \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "formats": ["markdown", "html"]
  }' | jq

# Test map endpoint
curl -X POST https://api.firecrawl.dev/v2/map \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://firecrawl.dev",
    "limit": 5
  }' | jq

# Test search endpoint
curl -X POST https://api.firecrawl.dev/v2/search \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "openai gpt-4",
    "limit": 3,
    "sources": [{"type": "web"}]
  }' | jq
```

### Method 5: Schema Diff Against Official Docs

Scrape the official Firecrawl docs and compare:

```bash
# Use the MCP pulse tool to scrape official docs
# (This would require setting up the MCP server)

# Or manually check each endpoint:
# - https://docs.firecrawl.dev/api-reference/endpoint/scrape
# - https://docs.firecrawl.dev/api-reference/endpoint/crawl-post
# - https://docs.firecrawl.dev/api-reference/endpoint/map
# - etc.
```

---

## 🔍 What We Validated

### ✅ Schema Structure
- Valid OpenAPI 3.0 syntax
- All references (`$ref`) resolve correctly
- No circular dependencies
- All required fields present

### ✅ Endpoint Coverage
- **21 total endpoints** documented
- All v2-exclusive endpoints included:
  - `/v2/crawl/params-preview`
  - `/v2/crawl/ongoing`
  - `/v2/crawl/active`
  - `/v2/team/credit-usage/historical`
  - `/v2/team/token-usage/historical`
  - `/v2/team/queue-status`
  - `/v2/concurrency-check`
  - `/v2/x402/search`

### ✅ Schema Completeness
- **21 component schemas** defined
- All request/response types present
- Error response schemas included
- Nested types (Action, Webhook, Location) documented

### ✅ Advanced Features
- **7 browser action types** (wait, click, write, press, scroll, executeJavascript, screenshot)
- **Search categories** (github, research, pdf)
- **Search sources** (web, news, images)
- **Webhook events** (completed, page, failed, started)
- **Location filtering** (country, languages)
- **Time-based search filters** (tbs parameter)
- **Async scraping mode** (job IDs for background processing)
- **Natural language prompts** (crawl configuration)

### ✅ Error Handling
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 408 Timeout
- 429 Too Many Requests
- 500 Internal Server Error

---

## 🐛 Known Limitations

### WebSocket Endpoint Not Documented

The WebSocket endpoint for real-time crawl status is **implemented but not in the schema**:

```
WS /v2/crawl/{jobId}
```

**Reason:** OpenAPI 3.0 doesn't support WebSocket endpoints (added in OpenAPI 3.1).

**Workaround:** Document separately or upgrade to OpenAPI 3.1.

**Implementation:** See [src/routes/v2.ts:241](../src/routes/v2.ts#L241)

---

## 📊 Validation Summary

| Test | Status | Details |
|------|--------|---------|
| **Swagger CLI** | ✅ PASS | Valid OpenAPI 3.0 schema |
| **Redocly Lint** | ✅ PASS | 19 style warnings (non-blocking) |
| **Bundle Test** | ✅ PASS | All references resolve |
| **Coverage Test** | ✅ PASS | 21/21 endpoints documented |
| **Schema Count** | ✅ PASS | 21/21 schemas present |
| **V2 Features** | ✅ PASS | 8/8 exclusive features included |
| **HTML Docs** | ✅ PASS | 362 KB interactive documentation |

---

## 🎯 Next Steps

### For API Consumers
1. Download `openapi-v2.json` from this repository
2. Generate client SDK in your language
3. Use interactive docs (`.docs/v2-api-docs.html`) for reference
4. Test against production API (`https://api.firecrawl.dev`)

### For API Developers
1. Keep schema in sync with code changes
2. Add missing 4XX responses to GET endpoints (optional)
3. Consider upgrading to OpenAPI 3.1 for WebSocket support
4. Add more example requests/responses

### For Integration Testing
1. Use mock server (Prism) for offline testing
2. Generate SDKs for type-safe integration
3. Validate requests against schema before sending
4. Set up CI/CD to lint schema on changes

---

## 📚 References

- **OpenAPI Specification:** https://swagger.io/specification/
- **Redocly CLI:** https://redocly.com/docs/cli/
- **Swagger CLI:** https://github.com/APIDevTools/swagger-cli
- **Prism Mock Server:** https://stoplight.io/open-source/prism
- **OpenAPI Generator:** https://openapi-generator.tech/
- **Firecrawl Docs:** https://docs.firecrawl.dev/api-reference/v2-introduction
