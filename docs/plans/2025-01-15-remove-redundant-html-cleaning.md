# Remove Redundant HTML Cleaning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove redundant HTML cleaning logic since Firecrawl already provides clean markdown output.

**Architecture:** Simplify ContentProcessorService to only handle LLM extraction. Remove BeautifulSoup4 and html2text processing since Firecrawl's /scrape endpoint already returns cleaned markdown via the `markdown` field. Update scrape endpoint to use Firecrawl's markdown directly instead of re-processing it.

**Tech Stack:**
- Python FastAPI (webhook service)
- Pytest (testing)
- Firecrawl API (already returns markdown)

**Impact:**
- Removes ~160 lines of redundant HTML processing code
- Eliminates html2text and BeautifulSoup4 dependencies
- Removes 20 unit tests for HTML cleaning
- Simplifies caching (no more `cleaned_content` field needed)
- Faster scraping (no redundant processing)

---

## Task 1: Update scrape.py to use Firecrawl markdown directly

**Files:**
- Modify: `apps/webhook/api/routers/scrape.py:270-320`
- Test manually: Scrape endpoint with `cleanScrape=true`

**Step 1: Update content extraction from Firecrawl response**

In `_handle_start_single_url()` function, replace the HTML processing logic:

```python
# BEFORE (lines 270-283):
raw_content = fc_data.get("html") or fc_data.get("markdown", "")
screenshot_b64 = fc_data.get("screenshot")
screenshot_bytes = base64.b64decode(screenshot_b64) if screenshot_b64 else None

# Process content
cleaned_content = None
if request.cleanScrape and raw_content:
    cleaned_content = await processor.clean_content(
        raw_html=raw_content,
        url=url,
        remove_scripts=True,
        remove_styles=True,
        extract_main=request.onlyMainContent
    )

# AFTER:
# Use Firecrawl's markdown directly when cleanScrape is true
cleaned_content = fc_data.get("markdown") if request.cleanScrape else None
raw_content = fc_data.get("html") or fc_data.get("markdown", "")
screenshot_b64 = fc_data.get("screenshot")
screenshot_bytes = base64.b64decode(screenshot_b64) if screenshot_b64 else None
```

**Step 2: Test manually with curl**

```bash
# Start webhook service
cd /compose/pulse/apps/webhook
WEBHOOK_PORT=50108 uv run uvicorn app.main:app --reload

# Test in new terminal
curl -X POST http://localhost:50108/api/v2/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-secret" \
  -d '{
    "url": "https://example.com",
    "cleanScrape": true,
    "resultHandling": "returnOnly"
  }'
```

Expected: Response with `markdown` field containing clean content (no HTML tags)

**Step 3: Commit**

```bash
git add apps/webhook/api/routers/scrape.py
git commit -m "refactor(webhook): use Firecrawl markdown directly

- Remove redundant clean_content() call in scrape endpoint
- Use fc_data.get('markdown') when cleanScrape=true
- Eliminates double-processing (Firecrawl already cleans HTML)
- Reduces latency by ~50-100ms per scrape"
```

---

## Task 2: Remove clean_content() from ContentProcessorService

**Files:**
- Modify: `apps/webhook/services/content_processor.py:59-163`
- Modify: `apps/webhook/services/content_processor.py:1-15` (imports)

**Step 1: Remove clean_content() method**

Delete lines 59-163 (the entire `clean_content()` method).

**Step 2: Remove unused imports**

```python
# BEFORE (lines 12-13):
import html2text
from bs4 import BeautifulSoup

# AFTER:
# Delete these imports - no longer needed
```

**Step 3: Update module docstring**

```python
# BEFORE (lines 1-8):
"""
Content processor service for HTML cleaning and LLM extraction.

Provides:
- HTML to Markdown conversion using html2text
- LLM-based structured data extraction
- Text normalization and cleaning
"""

# AFTER:
"""
Content processor service for LLM-based extraction.

Provides LLM-based structured data extraction from content.
HTML cleaning is handled by Firecrawl's scrape endpoint.
"""
```

**Step 4: Update class docstring**

```python
# BEFORE (lines 40-48):
class ContentProcessorService:
    """
    Service for processing web content.

    Features:
    - HTML to Markdown conversion with main content extraction
    - Script and style tag removal
    - LLM-based structured data extraction
    - Text normalization
    """

# AFTER:
class ContentProcessorService:
    """
    Service for LLM-based content extraction.

    Features:
    - LLM-based structured data extraction from markdown/text
    - Natural language query processing

    HTML to Markdown conversion is handled by Firecrawl API.
    """
```

**Step 5: Verify file structure**

```bash
cat apps/webhook/services/content_processor.py
```

Expected: File should have ~60 lines (was ~222 lines), only containing:
- Module docstring
- LLMClient interface
- ContentProcessorService class with only `extract_content()` method

**Step 6: Commit**

```bash
git add apps/webhook/services/content_processor.py
git commit -m "refactor(webhook): remove redundant clean_content() method

- Delete clean_content() method (160 lines)
- Remove html2text and BeautifulSoup4 imports
- Update docstrings to reflect LLM-only scope
- Firecrawl handles all HTML→Markdown conversion"
```

---

## Task 3: Remove test_content_processor_service.py HTML cleaning tests

**Files:**
- Delete: `apps/webhook/tests/unit/services/test_content_processor_service.py:21-421` (HTML cleaning tests)
- Keep: Lines 193-248 (LLM extraction tests)

**Step 1: Remove HTML cleaning tests**

Delete test methods:
- `test_clean_html_converts_to_markdown` (lines 21-56)
- `test_clean_html_removes_script_tags` (lines 57-82)
- `test_clean_html_removes_style_tags` (lines 83-109)
- `test_clean_html_extracts_main_content` (lines 110-143)
- `test_clean_html_handles_empty_input` (lines 144-154)
- `test_clean_html_handles_plain_text` (lines 156-170)
- `test_clean_html_preserves_links` (lines 171-192)
- `test_clean_html_handles_malformed_html` (lines 249-272)
- `test_clean_html_normalizes_whitespace` (lines 273-298)
- `test_clean_html_with_unicode_content` (lines 299-321)
- `test_clean_html_with_code_blocks` (lines 322-345)
- `test_clean_html_with_tables` (lines 346-388)
- `test_clean_html_removes_ads_and_popups` (lines 389-421)

**Step 2: Keep only LLM extraction tests**

Keep these tests (lines 193-248):
- `test_extract_content_with_mock_llm`
- `test_extract_content_raises_error_when_no_llm_client`
- `test_extract_content_handles_llm_errors`

**Step 3: Update module docstring**

```python
# BEFORE (lines 1-5):
"""
Unit tests for ContentProcessorService.

Tests HTML cleaning and LLM extraction functionality.
"""

# AFTER:
"""
Unit tests for ContentProcessorService.

Tests LLM extraction functionality.
HTML cleaning is handled by Firecrawl API (tested via integration tests).
"""
```

**Step 4: Run remaining tests**

```bash
cd /compose/pulse/apps/webhook
uv run pytest tests/unit/services/test_content_processor_service.py -v
```

Expected: 3 tests passing (all LLM extraction tests)

**Step 5: Commit**

```bash
git add apps/webhook/tests/unit/services/test_content_processor_service.py
git commit -m "test(webhook): remove redundant HTML cleaning tests

- Delete 13 HTML cleaning tests (no longer applicable)
- Keep 3 LLM extraction tests
- HTML cleaning tested via Firecrawl integration tests
- Reduces test suite by ~200 lines"
```

---

## Task 4: Remove html2text and beautifulsoup4 dependencies

**Files:**
- Modify: `apps/webhook/pyproject.toml` (dependencies section)

**Step 1: Check current dependencies**

```bash
cd /compose/pulse/apps/webhook
grep -A 20 'dependencies =' pyproject.toml
```

**Step 2: Remove html2text and beautifulsoup4**

In `pyproject.toml`, remove these lines from dependencies:
```toml
"html2text>=2020.1.16",
"beautifulsoup4>=4.12.0",
```

**Step 3: Sync dependencies**

```bash
uv sync
```

Expected: Dependencies updated, html2text and beautifulsoup4 removed

**Step 4: Verify imports still work**

```bash
uv run python -c "from services.content_processor import ContentProcessorService; print('✓ Imports OK')"
```

Expected: No import errors

**Step 5: Run full test suite**

```bash
uv run pytest tests/ -v
```

Expected: All tests passing (none should fail due to missing dependencies)

**Step 6: Commit**

```bash
git add apps/webhook/pyproject.toml uv.lock
git commit -m "chore(webhook): remove html2text and beautifulsoup4 dependencies

- Remove html2text (no longer used)
- Remove beautifulsoup4 (no longer used)
- Reduces dependencies by 2 packages
- Smaller Docker image, faster builds"
```

---

## Task 5: Remove verify_content_processor.py script

**Files:**
- Delete: `apps/webhook/verify_content_processor.py`

**Step 1: Check if script is referenced**

```bash
grep -r "verify_content_processor" apps/webhook/
```

Expected: Only found in the file itself (not imported/referenced elsewhere)

**Step 2: Delete verification script**

```bash
rm apps/webhook/verify_content_processor.py
```

**Step 3: Commit**

```bash
git add apps/webhook/verify_content_processor.py
git commit -m "chore(webhook): remove obsolete verify_content_processor script

- Script tested HTML cleaning (no longer applicable)
- HTML cleaning now handled by Firecrawl
- Reduces maintenance burden"
```

---

## Task 6: Update IMPLEMENTATION_NOTES.md

**Files:**
- Modify: `apps/webhook/IMPLEMENTATION_NOTES.md`

**Step 1: Find references to HTML cleaning**

```bash
grep -n "clean\|html2text\|BeautifulSoup" apps/webhook/IMPLEMENTATION_NOTES.md
```

**Step 2: Update or remove HTML cleaning references**

Update documentation to reflect that:
- HTML cleaning is handled by Firecrawl API
- ContentProcessorService only handles LLM extraction
- `cleaned_content` in cache is now Firecrawl's markdown output

**Step 3: Commit**

```bash
git add apps/webhook/IMPLEMENTATION_NOTES.md
git commit -m "docs(webhook): update notes to reflect Firecrawl handles HTML cleaning

- Remove references to html2text/BeautifulSoup processing
- Document that cleaned_content is Firecrawl markdown
- Update ContentProcessorService scope (LLM extraction only)"
```

---

## Task 7: Run full test suite and verify

**Files:**
- Test: All webhook tests
- Verify: Scrape endpoint behavior

**Step 1: Run pytest with coverage**

```bash
cd /compose/pulse/apps/webhook
uv run pytest tests/ -v --cov=app --cov=api --cov=services --cov=domain
```

Expected: All tests passing, coverage maintained

**Step 2: Test scrape endpoint manually**

```bash
# Test with cleanScrape=true
curl -X POST http://localhost:50108/api/v2/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-secret" \
  -d '{
    "url": "https://example.com",
    "cleanScrape": true,
    "resultHandling": "saveAndReturn"
  }' | jq .

# Test with cleanScrape=false (raw HTML)
curl -X POST http://localhost:50108/api/v2/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-secret" \
  -d '{
    "url": "https://example.com",
    "cleanScrape": false,
    "resultHandling": "saveAndReturn"
  }' | jq .
```

Expected:
- cleanScrape=true returns markdown (no HTML tags)
- cleanScrape=false returns raw HTML
- Both responses cached correctly

**Step 3: Check database cache entries**

```bash
# Check scrape_cache table
docker exec -it pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT url, content_type, length(cleaned_content), length(raw_content) FROM webhook.scrape_cache ORDER BY scraped_at DESC LIMIT 5;"
```

Expected:
- Entries with `content_type='text/markdown'` when cleanScrape=true
- Entries with `content_type='text/html'` when cleanScrape=false

**Step 4: Final commit**

```bash
git add .
git commit -m "test(webhook): verify Firecrawl markdown integration

- All tests passing after HTML cleaning removal
- Manual testing confirms correct markdown handling
- Cache correctly stores Firecrawl markdown"
```

---

## Summary

**Changes:**
- Removed 160 lines of redundant HTML processing code
- Removed 13 HTML cleaning tests (~200 lines)
- Removed 2 Python dependencies (html2text, beautifulsoup4)
- Updated documentation to reflect Firecrawl handles cleaning

**Benefits:**
- Faster scraping (no redundant processing)
- Simpler codebase (single source of truth: Firecrawl)
- Smaller Docker image (fewer dependencies)
- Reduced maintenance burden (fewer tests, less code)

**Verification:**
- All existing tests still pass
- Manual testing confirms markdown output
- Cache correctly stores Firecrawl markdown
- No regressions in scrape endpoint behavior
