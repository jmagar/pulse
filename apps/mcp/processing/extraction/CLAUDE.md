# Extract - LLM-Powered Information Extraction

LLM-based information extraction from scraped content using natural language queries.

## Purpose

Enables `extract` parameter in scrape tool: "Extract the author name and publication date"

## Architecture

**Factory Pattern**: `ExtractClientFactory` creates appropriate client based on `MCP_LLM_PROVIDER` environment variable.

**Three Provider Types**:

1. **Anthropic** - Native Anthropic SDK
2. **OpenAI** - OpenAI Chat Completions API
3. **OpenAI-Compatible** - Generic OpenAI-compatible endpoints (Together.ai, Groq, Perplexity, etc.)

## Files

- `types.ts` - Interfaces: `IExtractClient`, `LLMConfig`, `ExtractOptions`, `ExtractResult`
- `factory.ts` - `ExtractClientFactory` with static methods:
  - `createFromEnv()` - Factory from environment variables (returns null if unconfigured)
  - `create(config)` - Factory from LLMConfig object
  - `isAvailable()` - Check if extraction is configured
- `providers/anthropic-client.ts` - Anthropic Messages API implementation
- `providers/openai-client.ts` - OpenAI Chat Completions implementation
- `providers/openai-compatible-client.ts` - Generic OpenAI-compatible client

## Configuration

Environment variables support both namespaced (`MCP_*`) and legacy fallback:

```bash
# Provider selection (required to enable extraction)
MCP_LLM_PROVIDER=anthropic|openai|openai-compatible
# Fallback: LLM_PROVIDER=...

# Authentication (required)
MCP_LLM_API_KEY=your-api-key
# Fallback: LLM_API_KEY=...

# OpenAI-compatible only (required for openai-compatible)
MCP_LLM_API_BASE_URL=https://api.together.xyz/v1
# Fallback: LLM_API_BASE_URL=...

# Optional model override (defaults per provider)
MCP_LLM_MODEL=claude-sonnet-4-20250514
# Fallback: LLM_MODEL=...
```

## Default Models

- **Anthropic**: `claude-sonnet-4-20250514` (8192 max_tokens)
- **OpenAI**: `gpt-4.1-mini` (4096 max_tokens)
- **OpenAI-compatible**: Must be specified via `MCP_LLM_MODEL` (8192 max_tokens)

## Usage Pattern

```typescript
import { ExtractClientFactory } from "./factory";

// Factory from environment (gracefully returns null if unconfigured)
const client = ExtractClientFactory.createFromEnv();
if (!client) {
  // No LLM configured, extraction unavailable
  return rawContent;
}

// Extract information from content
const result = await client.extract(
  scrapedContent,
  "Extract product name, price, and rating"
);

if (result.success) {
  console.log(result.content);
} else {
  console.error(result.error);
}
```

## Client Interface

All clients implement `IExtractClient`:

```typescript
interface IExtractClient {
  extract(
    content: string,
    query: string,
    options?: ExtractOptions
  ): Promise<ExtractResult>;
}

interface ExtractResult {
  success: boolean;
  content?: string;
  error?: string;
}
```

## LLM Extraction Patterns

All providers use consistent pattern:

1. **System Prompt**: Expert at extracting specific information from web content
2. **User Prompt**: Content followed by extraction query
3. **Temperature**: 0 (deterministic extraction)
4. **Response Format**: Concise, readable text extraction or "not found" message

## Integration with Scrape Tool

Called from `tools/scrape/pipeline.ts` in `processContent()`:

1. Raw content is fetched and optionally cleaned
2. If `extract` parameter provided and `ExtractClientFactory.isAvailable()` returns true
3. Extraction performed on cleaned (if available) or raw content
4. Result becomes `displayContent` for client
5. Extracted content stored as separate tier in resource storage

## Supported Providers

Tested with:

- Anthropic Claude (full SDK support)
- OpenAI GPT-4, GPT-4 Turbo, GPT-4 Mini
- Together.ai (OpenAI-compatible)
- Groq (OpenAI-compatible)
- Perplexity (OpenAI-compatible)
- DeepSeek (OpenAI-compatible)
- Fireworks AI (OpenAI-compatible)

## Error Handling

- **No Config**: `ExtractClientFactory.createFromEnv()` returns `null` (graceful degradation)
- **Missing Config**: Returns `null`, scrape proceeds without extraction
- **API Errors**: Caught and returned as `ExtractResult.error` (non-fatal)
- **Network Errors**: Propagated to caller with context

## Factory Methods

`ExtractClientFactory.createFromEnv()`:
- Returns `null` if `MCP_LLM_PROVIDER` or `MCP_LLM_API_KEY` not set
- Supports both namespaced and legacy environment variable names
- Used by scrape pipeline for automatic initialization

`ExtractClientFactory.isAvailable()`:
- Returns `true` if LLM provider configured via environment
- Checked before attempting extraction
- Allows graceful degradation without extraction capability
