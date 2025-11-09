# Extract - LLM-Powered Information Extraction

LLM-based information extraction from scraped content using natural language queries.

## Purpose

Enables `extract` parameter in scrape tool: "Extract the author name and publication date"

## Architecture

**Factory Pattern**: [factory.ts](factory.ts) creates appropriate client based on `LLM_PROVIDER`

**Three Provider Types**:

1. **Anthropic** - Native Anthropic SDK ([anthropic-client.ts](anthropic-client.ts))
2. **OpenAI** - OpenAI API ([openai-client.ts](openai-client.ts))
3. **OpenAI-Compatible** - Generic OpenAI-compatible endpoints ([openai-compatible-client.ts](openai-compatible-client.ts))

## Files

- [types.ts](types.ts) - Common interfaces (`ExtractionClient`, `ExtractionRequest`, `ExtractionResponse`)
- [factory.ts](factory.ts) - `createExtractionClient()` factory function
- [anthropic-client.ts](anthropic-client.ts) - Anthropic Messages API implementation
- [openai-client.ts](openai-client.ts) - OpenAI Chat Completions API
- [openai-compatible-client.ts](openai-compatible-client.ts) - Together.ai, Groq, etc.

## Configuration

```bash
# Provider selection
LLM_PROVIDER=anthropic|openai|openai-compatible

# Authentication
LLM_API_KEY=your-api-key

# OpenAI-compatible only
LLM_API_BASE_URL=https://api.together.xyz/v1

# Optional model override
LLM_MODEL=claude-sonnet-4-20250514  # Defaults per provider
```

## Default Models

- **Anthropic**: `claude-sonnet-4-20250514` (Claude Sonnet 4)
- **OpenAI**: `gpt-4.1-mini` (GPT-4.1 Mini)
- **OpenAI-compatible**: Must be specified via `LLM_MODEL`

## Usage Pattern

```typescript
import { createExtractionClient } from './factory';

const client = createExtractionClient();
if (!client) {
  // No LLM configured, extraction unavailable
  return rawContent;
}

const result = await client.extract({
  content: scrapedContent,
  query: 'Extract product name, price, and rating',
});
```

## Client Interface

All clients implement `ExtractionClient`:

```typescript
interface ExtractionClient {
  extract(request: ExtractionRequest): Promise<ExtractionResponse>;
}
```

## OpenAI-Compatible Providers

Tested with:

- Together.ai
- Groq
- Perplexity
- DeepSeek
- Fireworks AI

Any provider with OpenAI-compatible `/v1/chat/completions` endpoint should work.

## Error Handling

- **No Config**: `createExtractionClient()` returns `null` (graceful degradation)
- **API Errors**: Thrown as-is with provider error messages
- **Network Errors**: HTTP errors propagated to caller

## Testing

Tests in [../../tests/functional/extract-clients.test.ts](../../tests/functional/extract-clients.test.ts)
