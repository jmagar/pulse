# Plugin Development Guide

This guide provides detailed instructions for creating custom content ingestion plugins for the webhook server.

## Table of Contents

- [Overview](#overview)
- [Plugin Architecture](#plugin-architecture)
- [Creating a New Plugin](#creating-a-new-plugin)
- [Plugin Interface](#plugin-interface)
- [Step-by-Step Tutorial](#step-by-step-tutorial)
- [Testing Your Plugin](#testing-your-plugin)
- [Best Practices](#best-practices)
- [Advanced Topics](#advanced-topics)
- [Troubleshooting](#troubleshooting)

## Overview

The plugin system allows you to extend the webhook server to ingest content from any source by implementing a simple interface. Each plugin:

1. **Identifies** URLs it can handle via pattern matching
2. **Fetches** content from the source
3. **Transforms** source-specific data into a standardized format (`IndexDocumentRequest`)
4. **Integrates** seamlessly with the existing indexing pipeline

## Plugin Architecture

### Core Components

```
┌─────────────────────┐
│   PluginRegistry    │  ← Manages plugins, routes URLs
└─────────┬───────────┘
          │
          ├─→ YouTubePlugin (Priority: 90)
          ├─→ RedditPlugin  (Priority: 90)
          ├─→ RSSPlugin     (Priority: 60)
          └─→ FirecrawlPlugin (Priority: 10, Default)
```

### URL Routing Flow

```
1. User provides URL
2. Registry checks plugins by priority (highest first)
3. First plugin where can_handle() returns True is selected
4. Plugin fetches and transforms content
5. Content flows into indexing pipeline
```

### Priority System

- **90-100**: Specific source plugins (YouTube, Reddit, Twitter)
- **50-70**: Format-based plugins (RSS, Atom, JSON)
- **10-30**: Generic scrapers with configuration
- **0-10**: Fallback/default plugins

## Plugin Interface

Every plugin must implement the `BasePlugin` abstract class:

```python
from plugins.base import BasePlugin
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest

class MyPlugin(BasePlugin):
    def can_handle(self, url: str) -> bool:
        """Check if this plugin can handle the URL"""
        pass
    
    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """Fetch and transform content"""
        pass
    
    def get_priority(self) -> int:
        """Return plugin priority (0-100)"""
        pass
    
    def get_name(self) -> str:
        """Return plugin name"""
        pass
    
    def get_supported_patterns(self) -> list[str]:
        """Return list of supported URL patterns"""
        pass
    
    async def health_check(self) -> bool:
        """Check if plugin dependencies are available"""
        pass
```

## Creating a New Plugin

### Step 1: Create Plugin File

Create a new file in `apps/webhook/plugins/`:

```bash
touch apps/webhook/plugins/my_plugin.py
```

### Step 2: Implement Basic Structure

```python
"""
MyService plugin for fetching content.

This plugin extracts content from MyService and transforms
it into documents suitable for RAG indexing.
"""

import re
from typing import TYPE_CHECKING, Any

from plugins.base import BasePlugin

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest

try:
    from utils.logging import get_logger
    logger = get_logger(__name__)
except ImportError:
    import logging
    logger = logging.getLogger(__name__)


class MyServicePlugin(BasePlugin):
    """Plugin for fetching content from MyService."""
    
    # URL patterns for matching
    URL_PATTERN = r"myservice\.com/([a-zA-Z0-9-]+)"
    
    def can_handle(self, url: str) -> bool:
        """Check if URL is from MyService."""
        return re.search(self.URL_PATTERN, url) is not None
    
    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """Fetch content from MyService."""
        # Implementation goes here
        pass
    
    def get_priority(self) -> int:
        """Return high priority for specific service."""
        return 85
    
    def get_name(self) -> str:
        """Return plugin name."""
        return "MyService Content Plugin"
    
    def get_supported_patterns(self) -> list[str]:
        """Return supported patterns."""
        return ["myservice.com/*"]
    
    async def health_check(self) -> bool:
        """Check if dependencies are available."""
        import importlib.util
        return importlib.util.find_spec("myservice_client") is not None
```

### Step 3: Implement fetch_content Method

This is where the main logic goes:

```python
async def fetch_content(
    self,
    url: str,
    **kwargs: Any,
) -> "IndexDocumentRequest":
    """
    Fetch content from MyService.
    
    Args:
        url: MyService URL
        **kwargs: Options like api_key, format, etc.
        
    Returns:
        IndexDocumentRequest with content
        
    Raises:
        ValueError: If URL is invalid
        Exception: If fetching fails
    """
    # Import at runtime to avoid dependency issues
    from api.schemas.indexing import IndexDocumentRequest
    
    # Extract ID from URL
    match = re.search(self.URL_PATTERN, url)
    if not match:
        raise ValueError(f"Invalid MyService URL: {url}")
    
    content_id = match.group(1)
    
    logger.info(
        "Fetching content from MyService",
        url=url,
        content_id=content_id,
    )
    
    # Fetch from your service
    try:
        import myservice_client
        
        client = myservice_client.Client(
            api_key=kwargs.get("api_key", "default_key")
        )
        content = await client.get_content(content_id)
        
        # Transform to markdown
        markdown = f"# {content.title}\n\n{content.body}"
        
        logger.info(
            "Content fetched successfully",
            url=url,
            content_id=content_id,
            title=content.title,
        )
        
        return IndexDocumentRequest(
            url=url,
            resolvedUrl=url,
            title=content.title,
            description=content.description or "",
            markdown=markdown,
            html="",
            statusCode=200,
            gcsPath=None,
            screenshotUrl=None,
            language=content.language or "en",
            country=None,
            isMobile=False,
        )
        
    except myservice_client.NotFoundError as e:
        logger.error(
            "Content not found",
            url=url,
            content_id=content_id,
            error=str(e),
        )
        raise ValueError(f"Content not found: {content_id}")
        
    except Exception as e:
        logger.error(
            "Error fetching content",
            url=url,
            content_id=content_id,
            error=str(e),
            error_type=type(e).__name__,
        )
        raise
```

### Step 4: Register Your Plugin

Add your plugin to the default registry in `services/plugin_ingestion.py`:

```python
def _create_default_registry(self) -> PluginRegistry:
    registry = PluginRegistry()
    
    # Existing plugins
    registry.register(YouTubePlugin())
    registry.register(RedditPlugin())
    
    # Your new plugin
    from plugins.my_plugin import MyServicePlugin
    registry.register(MyServicePlugin())
    
    # Format and fallback plugins
    registry.register(RSSPlugin())
    registry.register(FirecrawlPlugin(), is_default=True)
    
    return registry
```

### Step 5: Add Dependencies

Update `pyproject.toml` if your plugin needs external libraries:

```toml
dependencies = [
    # ... existing dependencies
    "myservice-client>=1.0.0",
]
```

Then rebuild:

```bash
cd apps/webhook
uv sync
```

## Step-by-Step Tutorial

Let's create a GitHub Issues plugin as a complete example.

### 1. Create the Plugin File

```python
# apps/webhook/plugins/github_issues.py
"""
GitHub Issues plugin for fetching issue content.
"""

import re
from typing import TYPE_CHECKING, Any

from plugins.base import BasePlugin

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest

try:
    from utils.logging import get_logger
    logger = get_logger(__name__)
except ImportError:
    import logging
    logger = logging.getLogger(__name__)


class GitHubIssuesPlugin(BasePlugin):
    """Plugin for fetching GitHub issue content."""
    
    ISSUE_PATTERN = r"github\.com/([^/]+)/([^/]+)/issues/(\d+)"
    
    def can_handle(self, url: str) -> bool:
        """Check if URL is a GitHub issue."""
        return re.search(self.ISSUE_PATTERN, url) is not None
    
    def _parse_url(self, url: str) -> tuple[str, str, str] | None:
        """Extract owner, repo, and issue number from URL."""
        match = re.search(self.ISSUE_PATTERN, url)
        if match:
            return match.group(1), match.group(2), match.group(3)
        return None
    
    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """Fetch GitHub issue content."""
        from api.schemas.indexing import IndexDocumentRequest
        
        parsed = self._parse_url(url)
        if not parsed:
            raise ValueError(f"Invalid GitHub issue URL: {url}")
        
        owner, repo, issue_num = parsed
        
        logger.info(
            "Fetching GitHub issue",
            url=url,
            owner=owner,
            repo=repo,
            issue=issue_num,
        )
        
        try:
            # Import GitHub client
            from github import Github
            
            # Initialize client
            token = kwargs.get("github_token")
            gh = Github(token) if token else Github()
            
            # Fetch issue
            repository = gh.get_repo(f"{owner}/{repo}")
            issue = repository.get_issue(int(issue_num))
            
            # Build markdown
            markdown_lines = [f"# {issue.title}\n"]
            markdown_lines.append(f"**Repository:** {owner}/{repo}\n")
            markdown_lines.append(f"**Issue:** #{issue_num}\n")
            markdown_lines.append(f"**State:** {issue.state}\n")
            markdown_lines.append(f"**Author:** {issue.user.login}\n")
            markdown_lines.append(f"**Created:** {issue.created_at}\n")
            
            if issue.labels:
                labels = ", ".join(label.name for label in issue.labels)
                markdown_lines.append(f"**Labels:** {labels}\n")
            
            markdown_lines.append("\n## Issue Description\n")
            markdown_lines.append(f"{issue.body}\n")
            
            # Include comments
            include_comments = kwargs.get("include_comments", True)
            if include_comments:
                markdown_lines.append("\n## Comments\n")
                for i, comment in enumerate(issue.get_comments(), 1):
                    markdown_lines.append(
                        f"\n### Comment {i} by {comment.user.login}\n"
                    )
                    markdown_lines.append(f"{comment.body}\n")
            
            full_markdown = "\n".join(markdown_lines)
            
            logger.info(
                "GitHub issue fetched successfully",
                url=url,
                issue=issue_num,
                title=issue.title[:50],
            )
            
            return IndexDocumentRequest(
                url=url,
                resolvedUrl=url,
                title=issue.title,
                description=f"GitHub issue #{issue_num} from {owner}/{repo}",
                markdown=full_markdown,
                html="",
                statusCode=200,
                gcsPath=None,
                screenshotUrl=None,
                language="en",
                country=None,
                isMobile=False,
            )
            
        except Exception as e:
            logger.error(
                "Error fetching GitHub issue",
                url=url,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise
    
    def get_priority(self) -> int:
        """Return high priority for GitHub."""
        return 90
    
    def get_name(self) -> str:
        """Return plugin name."""
        return "GitHub Issues Plugin"
    
    def get_supported_patterns(self) -> list[str]:
        """Return supported patterns."""
        return ["github.com/*/*/issues/*"]
    
    async def health_check(self) -> bool:
        """Check if PyGithub is available."""
        import importlib.util
        return importlib.util.find_spec("github") is not None
```

### 2. Add to Registry

```python
# services/plugin_ingestion.py
from plugins.github_issues import GitHubIssuesPlugin

def _create_default_registry(self) -> PluginRegistry:
    registry = PluginRegistry()
    
    registry.register(YouTubePlugin())
    registry.register(RedditPlugin())
    registry.register(GitHubIssuesPlugin())  # <-- Add here
    registry.register(RSSPlugin())
    registry.register(FirecrawlPlugin(), is_default=True)
    
    return registry
```

### 3. Add Dependency

```toml
# pyproject.toml
dependencies = [
    # ... existing
    "PyGithub>=2.1.0",
]
```

### 4. Test It

```bash
# Rebuild
cd apps/webhook
uv sync

# Test via API
curl -X POST http://localhost:50108/api/plugin/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/owner/repo/issues/123",
    "options": {"include_comments": true}
  }'
```

## Testing Your Plugin

### Unit Tests

Create `tests/unit/plugins/test_my_plugin.py`:

```python
import pytest
from plugins.my_plugin import MyServicePlugin


class TestMyServicePlugin:
    def test_plugin_name(self):
        plugin = MyServicePlugin()
        assert plugin.get_name() == "MyService Content Plugin"
    
    def test_plugin_priority(self):
        plugin = MyServicePlugin()
        assert plugin.get_priority() == 85
    
    @pytest.mark.parametrize("url,expected", [
        ("https://myservice.com/content123", True),
        ("https://example.com", False),
    ])
    def test_can_handle(self, url, expected):
        plugin = MyServicePlugin()
        assert plugin.can_handle(url) == expected
    
    @pytest.mark.asyncio
    async def test_health_check(self):
        plugin = MyServicePlugin()
        result = await plugin.health_check()
        assert isinstance(result, bool)
```

Run tests:

```bash
cd apps/webhook/tests/unit/plugins
uv run pytest test_my_plugin.py -v --override-ini="testpaths=."
```

### Integration Tests

Test with the full service:

```python
# tests/integration/test_my_plugin_integration.py
import pytest
from unittest.mock import Mock

from services.plugin_ingestion import PluginIngestionService


@pytest.mark.asyncio
async def test_plugin_ingestion():
    service = PluginIngestionService()
    queue = Mock()
    
    result = await service.ingest_url(
        "https://myservice.com/content123",
        queue
    )
    
    assert result["status"] == "queued"
    assert result["plugin"] == "MyService Content Plugin"
```

## Best Practices

### 1. Lazy Imports

Import heavy dependencies inside methods, not at module level:

```python
# ✅ Good
async def fetch_content(self, url: str, **kwargs: Any):
    import heavy_library  # Import when needed
    client = heavy_library.Client()
    
# ❌ Bad
import heavy_library  # Imported even if never used
```

### 2. Error Handling

Provide helpful error messages:

```python
try:
    content = await fetch_from_service(url)
except ServiceError as e:
    logger.error(
        "Failed to fetch content",
        url=url,
        error=str(e),
        error_code=e.code,
    )
    raise ValueError(f"Service returned error {e.code}: {e.message}")
```

### 3. Logging

Use structured logging:

```python
logger.info(
    "Fetching content",
    url=url,
    content_id=content_id,
    plugin=self.get_name(),
)
```

### 4. Type Safety

Use TYPE_CHECKING and string quotes for forward references:

```python
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest

async def fetch_content(self, url: str, **kwargs: Any) -> "IndexDocumentRequest":
    from api.schemas.indexing import IndexDocumentRequest
    # Implementation
```

### 5. Configuration

Support configuration via kwargs:

```python
async def fetch_content(self, url: str, **kwargs: Any):
    api_key = kwargs.get("api_key")
    timeout = kwargs.get("timeout", 30)
    max_items = kwargs.get("max_items", 10)
```

### 6. Health Checks

Implement meaningful health checks:

```python
async def health_check(self) -> bool:
    import importlib.util
    
    # Check if library is installed
    if importlib.util.find_spec("my_library") is None:
        logger.warning("my_library not installed", plugin=self.get_name())
        return False
    
    # Optionally check service availability
    try:
        import my_library
        client = my_library.Client()
        await client.ping()
        return True
    except Exception:
        return False
```

## Advanced Topics

### Custom Authentication

```python
class MyPlugin(BasePlugin):
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("MY_SERVICE_API_KEY")
    
    async def fetch_content(self, url: str, **kwargs: Any):
        api_key = kwargs.get("api_key", self.api_key)
        client = MyClient(api_key=api_key)
        # ...
```

### Caching

```python
from functools import lru_cache

class MyPlugin(BasePlugin):
    @lru_cache(maxsize=100)
    def _get_cached_metadata(self, content_id: str) -> dict:
        # Expensive operation
        return fetch_metadata(content_id)
```

### Rate Limiting

```python
from tenacity import retry, stop_after_attempt, wait_exponential

class MyPlugin(BasePlugin):
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    async def _fetch_with_retry(self, url: str):
        # Implementation with automatic retries
```

### Batch Processing

```python
async def fetch_content(self, url: str, **kwargs: Any):
    urls = kwargs.get("urls", [url])
    results = []
    
    for batch_url in urls:
        result = await self._fetch_single(batch_url)
        results.append(result)
    
    return self._combine_results(results)
```

## Troubleshooting

### Plugin Not Being Selected

**Problem:** Your plugin's `can_handle()` returns True but it's not being used.

**Solution:**
1. Check priority - higher priority plugins are checked first
2. Verify registration: `registry.list_plugins()`
3. Check logs to see which plugin was selected

### Import Errors

**Problem:** `ImportError` when loading plugins.

**Solution:**
1. Use TYPE_CHECKING for schema imports
2. Import heavy dependencies inside methods
3. Check health_check() returns False when dependencies missing

### Type Errors

**Problem:** mypy complains about return types.

**Solution:**
1. Quote return type: `-> "IndexDocumentRequest"`
2. Use TYPE_CHECKING guard
3. Import schema at runtime inside method

### Tests Failing

**Problem:** Tests can't import plugins properly.

**Solution:**
1. Use isolated test conftest
2. Mock external dependencies properly
3. Run tests from plugin directory:
   ```bash
   cd tests/unit/plugins
   pytest test_my_plugin.py -v --override-ini="testpaths=."
   ```

### Health Check Fails

**Problem:** `health_check()` returns False.

**Solution:**
1. Install dependencies: `uv sync`
2. Check importlib.util.find_spec() usage
3. Verify module name is correct

## Examples

See the following examples in the codebase:

- **Simple**: `plugins/firecrawl.py` - Basic pattern matching
- **API Integration**: `plugins/youtube.py` - External API with error handling
- **Complex Parsing**: `plugins/reddit.py` - Multiple URL patterns, nested data
- **Format Plugin**: `plugins/rss.py` - XML/feed parsing

## Resources

- [BasePlugin API Reference](base.py)
- [PluginRegistry API Reference](registry.py)
- [Plugin README](README.md)
- [Test Examples](../../tests/unit/plugins/)

## Support

If you have questions or need help developing a plugin:

1. Check the examples in `plugins/` directory
2. Review existing tests in `tests/unit/plugins/`
3. Read the main [Plugin README](README.md)
4. Check the logs when testing your plugin

## Next Steps

After creating your plugin:

1. ✅ Write comprehensive tests
2. ✅ Add documentation to your plugin file
3. ✅ Run linting: `ruff check plugins/my_plugin.py`
4. ✅ Format code: `ruff format plugins/my_plugin.py`
5. ✅ Test end-to-end via API
6. ✅ Consider edge cases and error handling
7. ✅ Update main README.md if needed

Happy plugin development! 🚀
