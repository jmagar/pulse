"""
Content processor service for HTML cleaning and LLM extraction.

Provides:
- HTML to Markdown conversion using html2text
- LLM-based structured data extraction
- Text normalization and cleaning
"""
import re
from typing import Optional

import html2text
from bs4 import BeautifulSoup

from utils.logging import logger


class LLMClient:
    """
    Interface for LLM clients used for extraction.

    Implementations should provide an extract() method.
    """

    async def extract(self, content: str, query: str) -> str:
        """
        Extract information from content using a natural language query.

        Args:
            content: The content to extract from
            query: Natural language query describing what to extract

        Returns:
            Extracted information as text
        """
        raise NotImplementedError("LLM client must implement extract()")


class ContentProcessorService:
    """
    Service for processing web content.

    Features:
    - HTML to Markdown conversion with main content extraction
    - Script and style tag removal
    - LLM-based structured data extraction
    - Text normalization
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        """
        Initialize content processor.

        Args:
            llm_client: Optional LLM client for extraction functionality
        """
        self.llm_client = llm_client

    async def clean_content(
        self,
        raw_html: str,
        url: str,
        remove_scripts: bool = True,
        remove_styles: bool = True,
        extract_main: bool = True,
    ) -> str:
        """
        Convert HTML to clean Markdown.

        Process HTML content by:
        1. Removing script and style tags
        2. Extracting main content area (if enabled)
        3. Converting to semantic Markdown
        4. Normalizing whitespace

        Args:
            raw_html: Raw HTML content
            url: Source URL (for logging/debugging)
            remove_scripts: Remove <script> tags (default: True)
            remove_styles: Remove <style> tags (default: True)
            extract_main: Extract only main content area (default: True)

        Returns:
            Cleaned Markdown text
        """
        if not raw_html:
            return ""

        try:
            # Parse HTML with BeautifulSoup
            soup = BeautifulSoup(raw_html, "html.parser")

            # Remove unwanted tags
            if remove_scripts:
                for script in soup.find_all("script"):
                    script.decompose()

            if remove_styles:
                for style in soup.find_all("style"):
                    style.decompose()

            # Remove common ad and popup patterns
            for pattern in ["advertisement", "cookie-popup", "cookie-banner", "popup"]:
                for element in soup.find_all(class_=re.compile(pattern, re.I)):
                    element.decompose()
                for element in soup.find_all(id=re.compile(pattern, re.I)):
                    element.decompose()

            # Extract main content if requested
            if extract_main:
                # Try to find main content area
                main_content = (
                    soup.find("main")
                    or soup.find("article")
                    or soup.find("div", class_=re.compile(r"content|main|article", re.I))
                    or soup.find("body")
                    or soup
                )
                soup = main_content

            # Convert to HTML string for html2text
            cleaned_html = str(soup)

            # Configure html2text converter
            h = html2text.HTML2Text()
            h.ignore_links = False  # Keep links
            h.ignore_images = False  # Keep images
            h.ignore_emphasis = False  # Keep bold/italic
            h.body_width = 0  # Don't wrap lines
            h.unicode_snob = True  # Use Unicode characters
            h.skip_internal_links = False
            h.inline_links = True
            h.protect_links = True
            h.ignore_mailto_links = False

            # Convert to Markdown
            markdown = h.handle(cleaned_html)

            # Normalize whitespace
            # Remove excessive blank lines (more than 2 consecutive)
            markdown = re.sub(r"\n{3,}", "\n\n", markdown)

            # Trim leading/trailing whitespace
            markdown = markdown.strip()

            logger.debug(
                "HTML cleaned to Markdown",
                url=url,
                raw_length=len(raw_html),
                cleaned_length=len(markdown),
            )

            return markdown

        except Exception as e:
            logger.warning(
                "HTML cleaning failed, returning original content",
                url=url,
                error=str(e),
            )
            # Return original content if cleaning fails
            return raw_html

    async def extract_content(
        self,
        content: str,
        url: str,
        extract_query: str,
    ) -> str:
        """
        Extract structured data using LLM.

        Uses configured LLM client to extract requested information from content
        based on natural language query.

        Args:
            content: Content to extract from (Markdown or text)
            url: Source URL (for logging)
            extract_query: Natural language query (e.g., "extract author and date")

        Returns:
            Extracted information as text

        Raises:
            ValueError: If LLM client not configured
        """
        if not self.llm_client:
            raise ValueError(
                "LLM client not configured for extraction. "
                "Initialize ContentProcessorService with an LLM client."
            )

        logger.info(
            "Extracting content with LLM",
            url=url,
            query=extract_query,
            content_length=len(content),
        )

        try:
            # Call LLM client for extraction
            result = await self.llm_client.extract(
                content=content,
                query=extract_query,
            )

            logger.info(
                "LLM extraction completed",
                url=url,
                extracted_length=len(result),
            )

            return result

        except Exception as e:
            logger.error(
                "LLM extraction failed",
                url=url,
                error=str(e),
            )
            raise
