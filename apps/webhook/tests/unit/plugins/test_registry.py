"""
Unit tests for plugin registry.
"""

from typing import Any

import pytest

from plugins.base import BasePlugin
from plugins.registry import PluginRegistry


class MockPlugin(BasePlugin):
    """Mock plugin for testing."""

    def __init__(self, name: str, priority: int, patterns: list[str]):
        self._name = name
        self._priority = priority
        self._patterns = patterns
        self._can_handle_urls = set()

    def add_handlable_url(self, url: str):
        """Add a URL this plugin can handle."""
        self._can_handle_urls.add(url)

    def can_handle(self, url: str) -> bool:
        return url in self._can_handle_urls

    async def fetch_content(self, url: str, **kwargs: Any) -> Any:
        from api.schemas.indexing import IndexDocumentRequest

        return IndexDocumentRequest(
            url=url,
            resolvedUrl=url,
            title=f"Content from {self._name}",
            description="Test content",
            markdown=f"# Test\n\nContent from {self._name}",
            html="",
            statusCode=200,
            gcsPath=None,
            screenshotUrl=None,
            language="en",
            country=None,
            isMobile=False,
        )

    def get_priority(self) -> int:
        return self._priority

    def get_name(self) -> str:
        return self._name

    def get_supported_patterns(self) -> list[str]:
        return self._patterns


class TestPluginRegistry:
    """Test cases for PluginRegistry."""

    def test_registry_initialization(self):
        """Test registry can be initialized."""
        registry = PluginRegistry()
        assert registry.get_plugin_count() == 0

    def test_register_plugin(self):
        """Test registering a plugin."""
        registry = PluginRegistry()
        plugin = MockPlugin("TestPlugin", 50, ["test://*"])

        registry.register(plugin)

        assert registry.get_plugin_count() == 1

    def test_register_default_plugin(self):
        """Test registering a default plugin."""
        registry = PluginRegistry()
        plugin = MockPlugin("DefaultPlugin", 10, ["*"])

        registry.register(plugin, is_default=True)

        assert registry.get_plugin_count() == 1
        # Default plugin should be used for URLs no plugin handles
        result = registry.get_plugin_for_url("http://unknown.com")
        assert result == plugin

    def test_get_plugin_for_url_matches(self):
        """Test getting plugin for a URL it can handle."""
        registry = PluginRegistry()
        plugin = MockPlugin("YouTubePlugin", 90, ["youtube.com/*"])
        plugin.add_handlable_url("https://youtube.com/watch?v=abc123")

        registry.register(plugin)

        result = registry.get_plugin_for_url("https://youtube.com/watch?v=abc123")
        assert result == plugin

    def test_get_plugin_for_url_no_match(self):
        """Test getting plugin for URL with no match and no default."""
        registry = PluginRegistry()
        plugin = MockPlugin("YouTubePlugin", 90, ["youtube.com/*"])
        plugin.add_handlable_url("https://youtube.com/watch?v=abc123")

        registry.register(plugin)

        result = registry.get_plugin_for_url("https://reddit.com/r/test")
        assert result is None

    def test_get_plugin_for_url_fallback_to_default(self):
        """Test falling back to default plugin when no match."""
        registry = PluginRegistry()

        youtube_plugin = MockPlugin("YouTubePlugin", 90, ["youtube.com/*"])
        youtube_plugin.add_handlable_url("https://youtube.com/watch?v=abc123")

        default_plugin = MockPlugin("DefaultPlugin", 10, ["*"])

        registry.register(youtube_plugin)
        registry.register(default_plugin, is_default=True)

        # Should use YouTube plugin for YouTube URL
        result = registry.get_plugin_for_url("https://youtube.com/watch?v=abc123")
        assert result == youtube_plugin

        # Should fall back to default for unknown URL
        result = registry.get_plugin_for_url("https://reddit.com/r/test")
        assert result == default_plugin

    def test_plugin_priority_ordering(self):
        """Test plugins are checked in priority order."""
        registry = PluginRegistry()

        # Create plugins with different priorities
        low_priority = MockPlugin("LowPriority", 10, ["*"])
        low_priority.add_handlable_url("https://test.com")

        high_priority = MockPlugin("HighPriority", 90, ["test.com/*"])
        high_priority.add_handlable_url("https://test.com")

        # Register in reverse priority order
        registry.register(low_priority)
        registry.register(high_priority)

        # Should match high priority plugin
        result = registry.get_plugin_for_url("https://test.com")
        assert result == high_priority

    def test_list_plugins(self):
        """Test listing all plugins."""
        registry = PluginRegistry()

        plugin1 = MockPlugin("Plugin1", 90, ["pattern1"])
        plugin2 = MockPlugin("Plugin2", 50, ["pattern2"])
        plugin3 = MockPlugin("Plugin3", 10, ["pattern3"])

        registry.register(plugin1)
        registry.register(plugin2)
        registry.register(plugin3, is_default=True)

        plugins = registry.list_plugins()

        assert len(plugins) == 3
        # Should be sorted by priority (high to low)
        assert plugins[0]["name"] == "Plugin1"
        assert plugins[0]["priority"] == 90
        assert plugins[1]["name"] == "Plugin2"
        assert plugins[2]["name"] == "Plugin3"
        assert plugins[2]["is_default"] is True

    @pytest.mark.asyncio
    async def test_validate_plugins(self):
        """Test validating all plugins."""
        registry = PluginRegistry()

        plugin1 = MockPlugin("Plugin1", 90, ["pattern1"])
        plugin2 = MockPlugin("Plugin2", 50, ["pattern2"])

        registry.register(plugin1)
        registry.register(plugin2)

        health = await registry.validate_plugins()

        assert len(health) == 2
        assert health["Plugin1"] is True
        assert health["Plugin2"] is True

    def test_unregister_plugin(self):
        """Test unregistering a plugin."""
        registry = PluginRegistry()

        plugin = MockPlugin("TestPlugin", 50, ["test://*"])
        registry.register(plugin)

        assert registry.get_plugin_count() == 1

        result = registry.unregister("TestPlugin")
        assert result is True
        assert registry.get_plugin_count() == 0

    def test_unregister_nonexistent_plugin(self):
        """Test unregistering a plugin that doesn't exist."""
        registry = PluginRegistry()

        result = registry.unregister("NonexistentPlugin")
        assert result is False

    def test_unregister_default_plugin(self):
        """Test unregistering the default plugin."""
        registry = PluginRegistry()

        plugin = MockPlugin("DefaultPlugin", 10, ["*"])
        registry.register(plugin, is_default=True)

        registry.unregister("DefaultPlugin")

        # Default plugin should be cleared
        result = registry.get_plugin_for_url("https://test.com")
        assert result is None

    def test_empty_url(self):
        """Test handling empty URL."""
        registry = PluginRegistry()
        default_plugin = MockPlugin("DefaultPlugin", 10, ["*"])
        registry.register(default_plugin, is_default=True)

        result = registry.get_plugin_for_url("")
        assert result == default_plugin

    def test_replace_default_plugin(self):
        """Test replacing default plugin."""
        registry = PluginRegistry()

        plugin1 = MockPlugin("Default1", 10, ["*"])
        plugin2 = MockPlugin("Default2", 20, ["*"])

        registry.register(plugin1, is_default=True)
        registry.register(plugin2, is_default=True)

        # Second plugin should be the default
        result = registry.get_plugin_for_url("https://test.com")
        assert result == plugin2
