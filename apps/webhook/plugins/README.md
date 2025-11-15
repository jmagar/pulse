# Plugin System for Content Ingestion

The webhook server includes a pluggable architecture for ingesting content from various sources beyond traditional web scraping. This allows easy integration of specialized content sources like YouTube transcripts, Reddit posts, RSS feeds, and more.

## Architecture

### Overview

```text
URL → Plugin Registry → Appropriate Plugin → IndexDocumentRequest → Indexing Pipeline
```

The plugin system automatically routes URLs to the appropriate content source plugin based on URL pattern matching and priority. Each plugin transforms source-specific data into a standardized `IndexDocumentRequest` format that flows into the existing RAG indexing pipeline.

### Components

1. **BasePlugin**: Abstract base class defining the plugin interface
2. **PluginRegistry**: Manages plugins and routes URLs to appropriate handlers
3. **PluginIngestionService**: Service layer for plugin-based content ingestion
4. **Built-in Plugins**: YouTube, Reddit, RSS, Firecrawl (fallback)

## Built-in Plugins

### YouTube Plugin (Priority: 90)

Fetches video transcripts from YouTube videos.

**Supported URLs:**
- `https://youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://youtube.com/embed/VIDEO_ID`
- `https://youtube.com/v/VIDEO_ID`

**Options:**
- `languages`: List of language codes to try (default: `["en"]`)
- `include_generated`: Include auto-generated captions (default: `True`)

**Example:**
```python
from plugins.youtube import YouTubePlugin

plugin = YouTubePlugin()
document = await plugin.fetch_content(
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    languages=["en", "es"],
    include_generated=True
)
```

### Reddit Plugin (Priority: 90)

Fetches content from Reddit posts and subreddits.

**Supported URLs:**
- `https://reddit.com/r/SUBREDDIT/comments/POST_ID/...` (single post)
- `https://reddit.com/r/SUBREDDIT` (subreddit top posts)

**Options:**
- `limit`: Number of posts to fetch for subreddits (default: `10`)
- `time_filter`: Time filter for subreddit posts - `day`, `week`, `month`, `year`, `all` (default: `day`)
- `include_comments`: Include top comments in post (default: `True`)
- `comment_limit`: Max comments to include (default: `20`)

**Configuration:**
Set Reddit API credentials via environment variables or pass to constructor:
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`

**Example:**
```python
from plugins.reddit import RedditPlugin

plugin = RedditPlugin(
    client_id="your_client_id",
    client_secret="your_secret"
)
document = await plugin.fetch_content(
    "https://reddit.com/r/python",
    limit=20,
    time_filter="week"
)
```

### RSS Plugin (Priority: 60)

Fetches and parses RSS/Atom feeds.

**Supported URLs:**
- Any URL containing `/feed`, `/rss`, `/atom`, `.rss`, `.atom`, `.xml`

**Options:**
- `limit`: Maximum number of entries to include (default: `10`)
- `include_content`: Include full content if available (default: `True`)
- `include_summary`: Include summary/description (default: `True`)

**Example:**
```python
from plugins.rss import RSSPlugin

plugin = RSSPlugin()
document = await plugin.fetch_content(
    "https://example.com/feed.xml",
    limit=20,
    include_content=True
)
```

### Firecrawl Plugin (Priority: 10)

Default fallback for general web scraping via Firecrawl API.

**Supported URLs:**
- Any `http://` or `https://` URL

**Note:** This plugin is a placeholder. The actual Firecrawl integration continues to use the webhook-based flow for optimal performance.

## Using the Plugin System

### Via API Endpoints

#### Ingest Single URL

```bash
curl -X POST http://localhost:50108/api/plugin/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "options": {
      "languages": ["en"],
      "include_generated": true
    }
  }'
```

Response:
```json
{
  "status": "queued",
  "job_id": "abc-123",
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "plugin": "YouTube Transcript Plugin",
  "title": "Video Title"
}
```

#### Batch Ingest Multiple URLs

```bash
curl -X POST http://localhost:50108/api/plugin/ingest/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://youtube.com/watch?v=abc123",
      "https://reddit.com/r/programming",
      "https://example.com/feed.xml"
    ],
    "options": {}
  }'
```

#### List Available Plugins

```bash
curl http://localhost:50108/api/plugin/plugins
```

Response:
```json
[
  {
    "name": "YouTube Transcript Plugin",
    "priority": 90,
    "patterns": ["youtube.com/watch?v=*", "youtu.be/*"],
    "is_default": false
  },
  {
    "name": "Reddit Content Plugin",
    "priority": 90,
    "patterns": ["reddit.com/r/*/comments/*/*", "reddit.com/r/*"],
    "is_default": false
  },
  ...
]
```

#### Check Plugin Health

```bash
curl http://localhost:50108/api/plugin/plugins/health
```

Response:
```json
{
  "plugins": {
    "YouTube Transcript Plugin": true,
    "Reddit Content Plugin": false,
    "RSS/Atom Feed Plugin": true,
    "Firecrawl Web Scraper": true
  }
}
```

### Programmatic Usage

```python
from services.plugin_ingestion import PluginIngestionService
from rq import Queue

# Initialize service (uses default plugin registry)
service = PluginIngestionService()

# Or create with custom registry
from plugins.registry import PluginRegistry
from plugins.youtube import YouTubePlugin

registry = PluginRegistry()
registry.register(YouTubePlugin())
service = PluginIngestionService(registry=registry)

# Ingest a URL
result = await service.ingest_url(
    url="https://youtube.com/watch?v=abc123",
    queue=queue,
    languages=["en", "es"]
)

# Batch ingest
results = await service.ingest_urls(
    urls=["https://youtube.com/...", "https://reddit.com/..."],
    queue=queue
)
```

## Creating Custom Plugins

### 1. Implement BasePlugin Interface

```python
from plugins.base import BasePlugin
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest

class MyCustomPlugin(BasePlugin):
    """Plugin for fetching content from MyService."""
    
    def can_handle(self, url: str) -> bool:
        """Check if URL matches myservice.com pattern."""
        return "myservice.com" in url
    
    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """Fetch and transform content from MyService."""
        # 1. Fetch content from your service
        content = await self._fetch_from_service(url)
        
        # 2. Transform to IndexDocumentRequest
        from api.schemas.indexing import IndexDocumentRequest
        
        return IndexDocumentRequest(
            url=url,
            resolvedUrl=url,
            title=content.title,
            description=content.description,
            markdown=content.text,
            html="",
            statusCode=200,
            gcsPath=None,
            screenshotUrl=None,
            language=content.language,
            country=None,
            isMobile=False,
        )
    
    def get_priority(self) -> int:
        """Return priority (0-100, higher = checked first)."""
        return 80  # High priority for specific service
    
    def get_name(self) -> str:
        """Return plugin name."""
        return "MyService Content Plugin"
    
    def get_supported_patterns(self) -> list[str]:
        """Return supported URL patterns."""
        return ["myservice.com/*"]
    
    async def health_check(self) -> bool:
        """Check if service dependencies are available."""
        try:
            import myservice_client
            return True
        except ImportError:
            return False
```

### 2. Register Your Plugin

```python
from plugins.registry import PluginRegistry
from my_plugin import MyCustomPlugin

registry = PluginRegistry()
registry.register(MyCustomPlugin())
```

### 3. Add to Default Registry

Edit `services/plugin_ingestion.py`:

```python
def _create_default_registry(self) -> PluginRegistry:
    registry = PluginRegistry()
    
    registry.register(YouTubePlugin())
    registry.register(RedditPlugin())
    registry.register(MyCustomPlugin())  # Add your plugin
    registry.register(RSSPlugin())
    registry.register(FirecrawlPlugin(), is_default=True)
    
    return registry
```

### 4. Add Dependencies

Update `pyproject.toml`:

```toml
dependencies = [
    # ... existing dependencies
    "myservice-client>=1.0.0",
]
```

## Plugin Priority Guidelines

- **90-100**: Specific source plugins (YouTube, Reddit, Twitter, etc.)
- **50-70**: Format-based plugins (RSS, Atom, JSON feeds)
- **10-30**: Generic scrapers with configuration
- **0-10**: Fallback/default plugins

Higher priority plugins are checked first when routing URLs.

## Best Practices

1. **Lazy Imports**: Import heavy dependencies inside methods, not at module level
2. **Error Handling**: Raise descriptive exceptions for common failure cases
3. **Health Checks**: Implement `health_check()` to validate dependencies
4. **Logging**: Use the logging utilities for consistent log formatting
5. **Options**: Support common options via `**kwargs` for flexibility
6. **TYPE_CHECKING**: Use TYPE_CHECKING to avoid circular imports

## Testing

### Unit Tests

```python
import pytest
from plugins.youtube import YouTubePlugin

class TestYouTubePlugin:
    def test_can_handle(self):
        plugin = YouTubePlugin()
        assert plugin.can_handle("https://youtube.com/watch?v=abc")
        assert not plugin.can_handle("https://reddit.com")
    
    @pytest.mark.asyncio
    async def test_fetch_content(self):
        plugin = YouTubePlugin()
        # Mock external API calls
        with patch("youtube_transcript_api.YouTubeTranscriptApi"):
            document = await plugin.fetch_content(
                "https://youtube.com/watch?v=abc"
            )
            assert document.url == "https://youtube.com/watch?v=abc"
```

### Integration Tests

Test with the full service:

```python
@pytest.mark.asyncio
async def test_plugin_ingestion_service():
    service = PluginIngestionService()
    
    # Mock queue
    queue = Mock()
    
    result = await service.ingest_url(
        "https://youtube.com/watch?v=abc",
        queue
    )
    
    assert result["status"] == "queued"
    assert result["plugin"] == "YouTube Transcript Plugin"
```

## Troubleshooting

### Plugin Not Being Selected

1. Check if `can_handle()` returns True for your URL
2. Verify plugin is registered in the registry
3. Check priority - higher priority plugins are checked first
4. Look at logs to see which plugin was selected

### Import Errors

Use `TYPE_CHECKING` for schema imports to avoid circular dependencies:

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest
```

### Missing Dependencies

Check plugin health:

```bash
curl http://localhost:50108/api/plugin/plugins/health
```

Install missing dependencies:

```bash
uv sync  # or pip install <package>
```

## Future Enhancements

- [ ] Twitter/X plugin for tweets and threads
- [ ] GitHub plugin for repositories, issues, PRs
- [ ] Notion plugin for pages and databases
- [ ] Google Docs plugin
- [ ] Confluence plugin
- [ ] Slack plugin for messages and threads
- [ ] Plugin configuration via environment variables
- [ ] Plugin marketplace/registry
- [ ] Plugin versioning and compatibility checks

## See Also

- [BasePlugin API Reference](base.py)
- [PluginRegistry API Reference](registry.py)
- [API Endpoints Documentation](../api/routers/plugin_indexing.py)
- [LlamaIndex Loaders](https://docs.llamaindex.ai/en/stable/module_guides/loading/simpledirectoryreader/) - Inspiration for this plugin system
