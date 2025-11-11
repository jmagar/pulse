"""
Plugin registry for managing and routing content ingestion plugins.

The registry maintains a collection of plugins and routes URLs to the
appropriate plugin based on URL pattern matching and priority.
"""

from typing import Optional

from plugins.base import BasePlugin
from utils.logging import get_logger

logger = get_logger(__name__)


class PluginRegistry:
    """
    Central registry for content ingestion plugins.
    
    The registry:
    1. Maintains a collection of registered plugins
    2. Routes URLs to appropriate plugins based on pattern matching
    3. Provides fallback to default plugin if no match is found
    4. Validates plugin health before use
    
    Example:
        >>> registry = PluginRegistry()
        >>> registry.register(YouTubePlugin())
        >>> registry.register(RedditPlugin())
        >>> plugin = registry.get_plugin_for_url("https://youtube.com/watch?v=abc")
        >>> document = await plugin.fetch_content(url)
    """

    def __init__(self) -> None:
        """Initialize the plugin registry."""
        self._plugins: list[BasePlugin] = []
        self._default_plugin: Optional[BasePlugin] = None
        logger.info("Plugin registry initialized")

    def register(
        self,
        plugin: BasePlugin,
        is_default: bool = False,
    ) -> None:
        """
        Register a plugin with the registry.
        
        Args:
            plugin: Plugin instance to register
            is_default: If True, this plugin will be used as fallback
                       when no other plugin matches a URL
                       
        Example:
            >>> registry.register(YouTubePlugin())
            >>> registry.register(FirecrawlPlugin(), is_default=True)
        """
        self._plugins.append(plugin)
        
        if is_default:
            if self._default_plugin is not None:
                logger.warning(
                    "Replacing existing default plugin",
                    old=self._default_plugin.get_name(),
                    new=plugin.get_name(),
                )
            self._default_plugin = plugin
            
        logger.info(
            "Plugin registered",
            plugin=plugin.get_name(),
            priority=plugin.get_priority(),
            is_default=is_default,
            patterns=plugin.get_supported_patterns(),
        )

    def get_plugin_for_url(self, url: str) -> Optional[BasePlugin]:
        """
        Find the appropriate plugin for a given URL.
        
        Plugins are checked in priority order (highest first).
        If no plugin matches, the default plugin is returned.
        
        Args:
            url: URL to find a plugin for
            
        Returns:
            Matching plugin, default plugin, or None if no plugins registered
            
        Example:
            >>> plugin = registry.get_plugin_for_url("https://youtube.com/watch?v=abc")
            >>> print(plugin.get_name())
            "YouTube Transcript Plugin"
        """
        if not url:
            logger.warning("Empty URL provided to plugin registry")
            return self._default_plugin

        # Sort plugins by priority (highest first)
        sorted_plugins = sorted(
            self._plugins,
            key=lambda p: p.get_priority(),
            reverse=True,
        )

        # Find first plugin that can handle the URL
        for plugin in sorted_plugins:
            try:
                if plugin.can_handle(url):
                    logger.info(
                        "Plugin matched for URL",
                        url=url,
                        plugin=plugin.get_name(),
                        priority=plugin.get_priority(),
                    )
                    return plugin
            except Exception as e:
                logger.error(
                    "Error checking if plugin can handle URL",
                    plugin=plugin.get_name(),
                    url=url,
                    error=str(e),
                )
                continue

        # No plugin matched, use default
        if self._default_plugin:
            logger.info(
                "No plugin matched, using default",
                url=url,
                default_plugin=self._default_plugin.get_name(),
            )
            return self._default_plugin

        logger.warning(
            "No plugin available for URL and no default plugin set",
            url=url,
        )
        return None

    def list_plugins(self) -> list[dict[str, any]]:
        """
        List all registered plugins with their metadata.
        
        Returns:
            List of plugin metadata dictionaries
            
        Example:
            >>> plugins = registry.list_plugins()
            >>> for plugin in plugins:
            ...     print(f"{plugin['name']}: {plugin['patterns']}")
        """
        result = []
        for plugin in self._plugins:
            is_default = plugin == self._default_plugin
            result.append({
                "name": plugin.get_name(),
                "priority": plugin.get_priority(),
                "patterns": plugin.get_supported_patterns(),
                "is_default": is_default,
            })
        return sorted(result, key=lambda p: p["priority"], reverse=True)

    async def validate_plugins(self) -> dict[str, bool]:
        """
        Run health checks on all registered plugins.
        
        Returns:
            Dictionary mapping plugin names to health status
            
        Example:
            >>> health = await registry.validate_plugins()
            >>> print(health)
            {"YouTube Transcript Plugin": True, "Reddit Plugin": True}
        """
        results = {}
        for plugin in self._plugins:
            try:
                is_healthy = await plugin.health_check()
                results[plugin.get_name()] = is_healthy
                
                if not is_healthy:
                    logger.warning(
                        "Plugin health check failed",
                        plugin=plugin.get_name(),
                    )
            except Exception as e:
                logger.error(
                    "Error during plugin health check",
                    plugin=plugin.get_name(),
                    error=str(e),
                )
                results[plugin.get_name()] = False
                
        return results

    def unregister(self, plugin_name: str) -> bool:
        """
        Unregister a plugin by name.
        
        Args:
            plugin_name: Name of the plugin to unregister
            
        Returns:
            True if plugin was found and removed, False otherwise
        """
        for i, plugin in enumerate(self._plugins):
            if plugin.get_name() == plugin_name:
                self._plugins.pop(i)
                
                if self._default_plugin and self._default_plugin.get_name() == plugin_name:
                    self._default_plugin = None
                    
                logger.info("Plugin unregistered", plugin=plugin_name)
                return True
                
        logger.warning("Plugin not found for unregistration", plugin=plugin_name)
        return False

    def get_plugin_count(self) -> int:
        """
        Get the number of registered plugins.
        
        Returns:
            Number of registered plugins
        """
        return len(self._plugins)
