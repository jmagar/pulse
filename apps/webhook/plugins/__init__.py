"""
Plugin system for extensible content ingestion.

This module provides a pluggable architecture for ingesting content from
various sources (YouTube, Reddit, RSS, etc.) into the RAG pipeline.

Example:
    >>> from plugins import PluginRegistry
    >>> registry = PluginRegistry()
    >>> plugin = registry.get_plugin_for_url("https://youtube.com/watch?v=...")
    >>> document = await plugin.fetch_content(url)
"""

from plugins.base import BasePlugin
from plugins.registry import PluginRegistry

__all__ = ["BasePlugin", "PluginRegistry"]
