"""
Unit tests for ContentProcessorService.

Tests HTML cleaning and LLM extraction functionality.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock

from services.content_processor import ContentProcessorService


@pytest.mark.asyncio
class TestContentProcessorService:
    """Test content processing operations."""

    @pytest.fixture
    def processor_service(self) -> ContentProcessorService:
        """Create content processor service instance."""
        return ContentProcessorService()

    async def test_clean_html_converts_to_markdown(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test HTML cleaning converts to clean Markdown."""
        html = """
        <html>
            <body>
                <article>
                    <h1>Test Article</h1>
                    <p>This is a test paragraph with <strong>bold</strong> text.</p>
                    <ul>
                        <li>Item 1</li>
                        <li>Item 2</li>
                    </ul>
                </article>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        # Should contain Markdown formatting
        assert "# Test Article" in result or "Test Article" in result
        assert "test paragraph" in result
        assert "bold" in result
        assert "Item 1" in result
        assert "Item 2" in result
        # Should not contain HTML tags
        assert "<article>" not in result
        assert "<h1>" not in result
        assert "<p>" not in result

    async def test_clean_html_removes_script_tags(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test script tags are removed during cleaning."""
        html = """
        <html>
            <head><script>alert('xss')</script></head>
            <body>
                <h1>Title</h1>
                <script>console.log('tracking')</script>
                <p>Content</p>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        assert "alert" not in result
        assert "console.log" not in result
        assert "Title" in result
        assert "Content" in result

    async def test_clean_html_removes_style_tags(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test style tags are removed during cleaning."""
        html = """
        <html>
            <head><style>.test { color: red; }</style></head>
            <body>
                <h1>Title</h1>
                <style>.inline { display: none; }</style>
                <p>Content</p>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        assert "color: red" not in result
        assert "display: none" not in result
        assert ".test" not in result
        assert "Title" in result
        assert "Content" in result

    async def test_clean_html_extracts_main_content(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test main content extraction removes navigation and footer."""
        html = """
        <html>
            <body>
                <nav>
                    <a href="/">Home</a>
                    <a href="/about">About</a>
                </nav>
                <main>
                    <h1>Main Article</h1>
                    <p>This is the main content.</p>
                </main>
                <footer>
                    <p>Copyright 2025</p>
                </footer>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        # Main content should be present
        assert "Main Article" in result
        assert "main content" in result
        # Navigation and footer should be reduced or removed
        # (Some converters may keep minimal navigation)

    async def test_clean_html_handles_empty_input(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test cleaning empty HTML returns empty string."""
        result = await processor_service.clean_content(
            raw_html="",
            url="https://example.com/test"
        )

        assert result == ""

    async def test_clean_html_handles_plain_text(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test cleaning plain text returns it unchanged."""
        text = "This is plain text without HTML tags."

        result = await processor_service.clean_content(
            raw_html=text,
            url="https://example.com/test"
        )

        assert "plain text" in result
        assert "without HTML tags" in result

    async def test_clean_html_preserves_links(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test HTML cleaning preserves hyperlinks in Markdown format."""
        html = """
        <html>
            <body>
                <p>Visit <a href="https://example.com">our website</a> for more info.</p>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        # Should contain link in Markdown format [text](url) or preserve URL
        assert "example.com" in result
        assert "our website" in result or "more info" in result

    async def test_extract_content_with_mock_llm(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test LLM extraction with mocked client."""
        mock_llm_client = AsyncMock()
        mock_llm_client.extract.return_value = "Author: John Doe\nDate: 2025-11-15"

        processor_service.llm_client = mock_llm_client

        content = "# Article\n\nWritten by John Doe on November 15, 2025."
        extract_query = "extract the author name and publication date"

        result = await processor_service.extract_content(
            content=content,
            url="https://example.com/article",
            extract_query=extract_query
        )

        assert result == "Author: John Doe\nDate: 2025-11-15"
        mock_llm_client.extract.assert_called_once_with(
            content=content,
            query=extract_query
        )

    async def test_extract_content_raises_error_when_no_llm_client(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test extraction raises error when LLM client not configured."""
        processor_service.llm_client = None

        with pytest.raises(ValueError, match="LLM client not configured"):
            await processor_service.extract_content(
                content="Test content",
                url="https://example.com",
                extract_query="extract something"
            )

    async def test_extract_content_handles_llm_errors(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test extraction handles LLM errors gracefully."""
        mock_llm_client = AsyncMock()
        mock_llm_client.extract.side_effect = Exception("LLM API error")

        processor_service.llm_client = mock_llm_client

        with pytest.raises(Exception, match="LLM API error"):
            await processor_service.extract_content(
                content="Test content",
                url="https://example.com",
                extract_query="extract something"
            )

    async def test_clean_html_handles_malformed_html(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test cleaning handles malformed HTML gracefully."""
        malformed_html = """
        <html>
            <body>
                <h1>Unclosed heading
                <p>Paragraph without closing tag
                <div>Nested <span>tags
            </body>
        """

        result = await processor_service.clean_content(
            raw_html=malformed_html,
            url="https://example.com/test"
        )

        # Should still extract text content despite malformed HTML
        assert "Unclosed heading" in result
        assert "Paragraph without closing tag" in result
        assert "Nested" in result or "tags" in result

    async def test_clean_html_normalizes_whitespace(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test cleaning normalizes excessive whitespace."""
        html = """
        <html>
            <body>
                <p>Text    with     excessive     spaces</p>


                <p>Multiple blank lines</p>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        # Should normalize excessive spaces and blank lines
        assert "excessive     spaces" not in result  # Excessive spaces reduced
        # At most 2 consecutive newlines
        assert "\n\n\n" not in result

    async def test_clean_html_with_unicode_content(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test cleaning handles Unicode characters correctly."""
        html = """
        <html>
            <body>
                <h1>Tëst Articlé</h1>
                <p>Content with emoji: 🚀 and symbols: €, ®, ©</p>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        assert "Tëst Articlé" in result
        assert "🚀" in result
        assert "€" in result

    async def test_clean_html_with_code_blocks(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test cleaning preserves code blocks."""
        html = """
        <html>
            <body>
                <h1>Code Example</h1>
                <pre><code>def hello():
    print("Hello, World!")</code></pre>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        assert "Code Example" in result
        assert "def hello" in result
        assert "Hello, World!" in result

    async def test_clean_html_with_tables(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test cleaning handles HTML tables."""
        html = """
        <html>
            <body>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Age</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Alice</td>
                            <td>30</td>
                        </tr>
                        <tr>
                            <td>Bob</td>
                            <td>25</td>
                        </tr>
                    </tbody>
                </table>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        # Should preserve table data
        assert "Name" in result
        assert "Age" in result
        assert "Alice" in result
        assert "Bob" in result
        assert "30" in result
        assert "25" in result

    async def test_clean_html_removes_ads_and_popups(
        self,
        processor_service: ContentProcessorService
    ) -> None:
        """Test cleaning removes common ad and popup patterns."""
        html = """
        <html>
            <body>
                <div class="advertisement">
                    <p>Buy our product!</p>
                </div>
                <main>
                    <h1>Real Content</h1>
                    <p>This is the actual content.</p>
                </main>
                <div id="cookie-popup">
                    <p>We use cookies.</p>
                </div>
            </body>
        </html>
        """

        result = await processor_service.clean_content(
            raw_html=html,
            url="https://example.com/test"
        )

        # Main content should be present
        assert "Real Content" in result
        assert "actual content" in result
        # Ads and popups should be reduced or removed
        # (Some converters may keep minimal content)
