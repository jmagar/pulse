# Query Tool

Search indexed documentation via the webhook service with hybrid/semantic/keyword modes. Returns plain-text output showing 10 results per page, including IDs you can use to fetch full documents via `GET /api/content/{id}`.

## Features

- Accurate pagination (limit/offset) with totals
- 10 results per page by default
- Multiple modes: hybrid (vector+BM25), semantic (vector), keyword (BM25)
- Rich metadata: domain, language, country, section, source_type, mobile flag
- Content IDs surfaced for follow-up retrieval
- Resilient: retries with jittered exponential backoff on 429/5xx
- Structured logging around handler execution

## Usage

```typescript
const tool = createQueryTool({
  baseUrl: "http://localhost:50108",
  apiSecret: process.env.WEBHOOK_API_SECRET!,
});

const result = await tool.handler({
  query: "firecrawl scrape formats",
  mode: "hybrid",
  limit: 10,
  offset: 0,
  filters: {
    domain: "docs.firecrawl.dev",
  },
});
```

Output (plain text):

```
Query: firecrawl scrape formats
Mode: hybrid

Results 1-10 (of ~47)

1. Result Title
   URL: https://example.com/page
   Description: Brief description
   Snippet: Matched text excerpt...
   Meta: ID=251 | Domain=example.com | Lang=en | Country=us | Mobile=true | Section=Docs | Type=documentation | Score=0.95

...

Showing 10 of 47 results. Re-run with offset=10 to continue.
```

To fetch the full document, call `GET /api/content/{id}` with the `id` shown in `Meta: ID=...` (auth header required: `Authorization: Bearer <WEBHOOK_API_SECRET>`).

## Testing

```bash
# Unit
pnpm test tests/tools/query/client.test.ts -- --runInBand
pnpm test tests/tools/query/response.test.ts -- --runInBand
pnpm test tests/tools/query/retry.test.ts -- --runInBand
pnpm test tests/tools/query/handler.test.ts -- --runInBand

# Integration (requires running webhook and data)
RUN_QUERY_TOOL_INTEGRATION=true WEBHOOK_BASE_URL=http://localhost:50108 WEBHOOK_API_SECRET=<secret> \
  pnpm test tests/integration/query-tool.test.ts -- --runInBand
```
