#!/usr/bin/env python3
"""
Manual verification script for ContentProcessorService.
Tests the basic functionality without pytest.
"""
import asyncio
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from services.content_processor import ContentProcessorService, LLMClient


class MockLLMClient(LLMClient):
    """Mock LLM client for testing."""

    async def extract(self, content: str, query: str) -> str:
        """Mock extraction that returns test data."""
        return f"EXTRACTED: {query[:50]}..."


async def test_html_cleaning():
    """Test HTML cleaning functionality."""
    print("Testing HTML cleaning...")

    processor = ContentProcessorService()

    html = """
    <html>
        <head>
            <script>alert('xss')</script>
            <style>.test { color: red; }</style>
        </head>
        <body>
            <nav>Navigation</nav>
            <main>
                <h1>Test Article</h1>
                <p>This is a test paragraph with <strong>bold</strong> text.</p>
                <ul>
                    <li>Item 1</li>
                    <li>Item 2</li>
                </ul>
            </main>
            <footer>Copyright 2025</footer>
        </body>
    </html>
    """

    result = await processor.clean_content(
        raw_html=html,
        url="https://example.com/test"
    )

    # Verify script/style removed
    assert "alert" not in result, "Script tag not removed!"
    assert "color: red" not in result, "Style tag not removed!"

    # Verify content preserved
    assert "Test Article" in result, "Main content missing!"
    assert "test paragraph" in result, "Paragraph content missing!"
    assert "Item 1" in result, "List item missing!"

    # Verify no HTML tags
    assert "<h1>" not in result, "HTML tags not converted!"
    assert "<main>" not in result, "HTML tags not converted!"

    print("✓ HTML cleaning passed!")
    print(f"  Original length: {len(html)}")
    print(f"  Cleaned length: {len(result)}")
    print(f"  Sample output: {result[:200]}...")
    return True


async def test_llm_extraction():
    """Test LLM extraction functionality."""
    print("\nTesting LLM extraction...")

    mock_llm = MockLLMClient()
    processor = ContentProcessorService(llm_client=mock_llm)

    content = "# Article\n\nWritten by John Doe on November 15, 2025."
    extract_query = "extract the author name and publication date"

    result = await processor.extract_content(
        content=content,
        url="https://example.com/article",
        extract_query=extract_query
    )

    assert "EXTRACTED" in result, "Extraction failed!"
    assert extract_query[:30] in result, "Query not passed to LLM!"

    print("✓ LLM extraction passed!")
    print(f"  Result: {result}")
    return True


async def test_no_llm_client():
    """Test extraction without LLM client raises error."""
    print("\nTesting extraction without LLM client...")

    processor = ContentProcessorService()  # No LLM client

    try:
        await processor.extract_content(
            content="test",
            url="https://example.com",
            extract_query="test"
        )
        print("✗ Should have raised ValueError!")
        return False
    except ValueError as e:
        if "LLM client not configured" in str(e):
            print("✓ Correctly raised ValueError!")
            return True
        else:
            print(f"✗ Wrong error message: {e}")
            return False


async def test_empty_html():
    """Test cleaning empty HTML."""
    print("\nTesting empty HTML...")

    processor = ContentProcessorService()
    result = await processor.clean_content(
        raw_html="",
        url="https://example.com/test"
    )

    assert result == "", "Empty HTML should return empty string!"
    print("✓ Empty HTML handled correctly!")
    return True


async def test_unicode_content():
    """Test Unicode handling."""
    print("\nTesting Unicode content...")

    processor = ContentProcessorService()

    html = """
    <html>
        <body>
            <h1>Tëst Articlé</h1>
            <p>Content with emoji: 🚀 and symbols: €, ®, ©</p>
        </body>
    </html>
    """

    result = await processor.clean_content(
        raw_html=html,
        url="https://example.com/test"
    )

    assert "Tëst Articlé" in result, "Unicode characters lost!"
    assert "🚀" in result, "Emoji lost!"
    assert "€" in result, "Symbol lost!"

    print("✓ Unicode content handled correctly!")
    return True


async def main():
    """Run all verification tests."""
    print("=" * 60)
    print("ContentProcessorService Verification")
    print("=" * 60)

    tests = [
        test_html_cleaning,
        test_llm_extraction,
        test_no_llm_client,
        test_empty_html,
        test_unicode_content,
    ]

    results = []
    for test in tests:
        try:
            result = await test()
            results.append(result)
        except Exception as e:
            print(f"✗ Test failed with exception: {e}")
            import traceback
            traceback.print_exc()
            results.append(False)

    print("\n" + "=" * 60)
    print(f"Results: {sum(results)}/{len(results)} tests passed")
    print("=" * 60)

    return all(results)


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
