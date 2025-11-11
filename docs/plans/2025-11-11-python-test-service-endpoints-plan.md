# Python Test Service Endpoints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure `apps/webhook/tests` consume service host/port values from a shared helper rather than hardcoded literals.

**Architecture:** Introduce a small test-only helper that instantiates `Settings` once and exposes accessor functions for Firecrawl, changedetection, Qdrant, TEI, Redis, and related service URLs/ports. Update affected tests to import these helpers and validate via configuration-driven values, maintaining override tests via monkeypatching.

**Tech Stack:** Python 3.13, Pytest, Pydantic Settings, uv tooling.

---

### Task 1: Add shared test helper for service endpoints

**Files:**
- Create: `apps/webhook/tests/utils/service_endpoints.py`
- Create: `apps/webhook/tests/unit/test_service_endpoints_helper.py`

**Step 1: Write the failing test**

```python
# apps/webhook/tests/unit/test_service_endpoints_helper.py
from tests.utils.service_endpoints import (
    get_changedetection_base_url,
    get_firecrawl_base_url,
    get_qdrant_base_url,
    get_tei_base_url,
)


def test_helper_reads_current_settings(monkeypatch):
    monkeypatch.setenv("WEBHOOK_FIRECRAWL_API_URL", "http://custom-firecrawl:6000")
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_API_URL", "http://custom-change:6001")
    monkeypatch.setenv("WEBHOOK_QDRANT_URL", "http://custom-qdrant:6002")
    monkeypatch.setenv("WEBHOOK_TEI_URL", "http://custom-tei:6003")

    assert get_firecrawl_base_url() == "http://custom-firecrawl:6000"
    assert get_changedetection_base_url() == "http://custom-change:6001"
    assert get_qdrant_base_url() == "http://custom-qdrant:6002"
    assert get_tei_base_url() == "http://custom-tei:6003"
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook && uv run pytest tests/unit/test_service_endpoints_helper.py -v
```
Expected: FAIL because helper module does not exist.

**Step 3: Write minimal implementation**

```python
# apps/webhook/tests/utils/service_endpoints.py
from functools import lru_cache
from typing import Final

from config import Settings

@lru_cache(maxsize=1)
def _load_settings() -> Settings:
    return Settings()


def get_firecrawl_base_url() -> str:
    return _load_settings().firecrawl_api_url

# repeat for changedetection, qdrant, tei, redis, ports as needed
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook && uv run pytest tests/unit/test_service_endpoints_helper.py -v
```
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/webhook/tests/utils/service_endpoints.py \
        apps/webhook/tests/unit/test_service_endpoints_helper.py
git commit -m "test: add service endpoint helper"
```

---

### Task 2: Update configuration default tests to use helper

**Files:**
- Modify: `apps/webhook/tests/unit/test_config_changedetection.py`
- Modify: `apps/webhook/tests/unit/test_config.py`
- Modify: `apps/webhook/tests/unit/test_config_fallback.py`

**Step 1: Write failing tests referencing helpers**

Update assertions expecting literal URLs to reference helper outputs, e.g.:

```python
from tests.utils.service_endpoints import (
    get_firecrawl_base_url,
    get_qdrant_base_url,
    get_tei_base_url,
)


def test_firecrawl_api_url_default():
    settings = Settings()
    assert settings.firecrawl_api_url == get_firecrawl_base_url()
```

Run targeted tests:

```bash
cd apps/webhook && uv run pytest \
  tests/unit/test_config_changedetection.py::test_firecrawl_api_url_default -v
```
Expected: FAIL because helper currently reads same settings; adjust tests to set env to known values before comparing.

**Step 2: Ensure RED**
Run the suite for updated files to confirm failures due to new helper usage.

**Step 3: Implement minimal changes**
- Import helper functions.
- Replace literals for service endpoints with helper outputs in assertions.
- Keep override tests by setting env vars and comparing against helper after override.

**Step 4: Run updated tests**

```bash
cd apps/webhook && uv run pytest tests/unit/test_config_changedetection.py -v
cd apps/webhook && uv run pytest tests/unit/test_config.py -v
cd apps/webhook && uv run pytest tests/unit/test_config_fallback.py -v
```
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/webhook/tests/unit/test_config_changedetection.py \
        apps/webhook/tests/unit/test_config.py \
        apps/webhook/tests/unit/test_config_fallback.py
git commit -m "test: use service endpoint helper in config tests"
```

---

### Task 3: Update changedetection-related integration/unit tests

**Files:**
- Modify: `apps/webhook/tests/unit/test_changedetection_client.py`
- Modify: `apps/webhook/tests/integration/test_changedetection_webhook.py`
- Modify: `apps/webhook/tests/integration/test_changedetection_e2e.py`
- Modify: `apps/webhook/tests/unit/test_metadata_helpers.py`

**Step 1: Write failing test expectations**
- Import helper `get_changedetection_base_url()` and use `urljoin` or f-string to build expected diff URLs.
- Ensure tests constructing clients without overrides rely on helper values.

Example snippet:

```python
from urllib.parse import urljoin
from tests.utils.service_endpoints import get_changedetection_base_url

DEFAULT_DIFF = urljoin(get_changedetection_base_url(), "/diff/test-watch-123")
```

Run one representative test to confirm failure:

```bash
cd apps/webhook && uv run pytest tests/unit/test_changedetection_client.py::test_build_diff_url -v
```
Expected: FAIL referencing missing helper usage.

**Step 2: Implement minimal code**
- Replace direct strings like `"http://changedetection:5000"` with helper outputs.
- Where tests need custom URLs (monkeypatch), continue to set env via `monkeypatch.setenv`.

**Step 3: Run associated tests**

```bash
cd apps/webhook && uv run pytest tests/unit/test_changedetection_client.py -v
cd apps/webhook && uv run pytest tests/integration/test_changedetection_webhook.py -v
cd apps/webhook && uv run pytest tests/integration/test_changedetection_e2e.py -v
cd apps/webhook && uv run pytest tests/unit/test_metadata_helpers.py -v
```
Expected: PASS.

**Step 4: Commit**

```bash
git add apps/webhook/tests/unit/test_changedetection_client.py \
        apps/webhook/tests/integration/test_changedetection_webhook.py \
        apps/webhook/tests/integration/test_changedetection_e2e.py \
        apps/webhook/tests/unit/test_metadata_helpers.py
git commit -m "test: reference helper for changedetection endpoints"
```

---

### Task 4: Update remaining service endpoint references (Qdrant, TEI, metrics APIs)

**Files:**
- Modify: `apps/webhook/tests/unit/test_vector_store.py`
- Modify: `apps/webhook/tests/unit/test_embedding_service.py`
- Modify: `apps/webhook/tests/integration/test_metrics_api.py`
- Modify: `apps/webhook/tests/integration/test_middleware_integration.py`

**Step 1: Write failing tests referencing helpers**
- Import `get_qdrant_base_url`, `get_tei_base_url`, `get_service_base_url("api")` as needed (extend helper to provide host/port for API base `http://localhost:<port>`).
- Update expected URLs to call helper functions.

Example:

```python
from tests.utils.service_endpoints import get_tei_base_url

service = EmbeddingService(tei_url=get_tei_base_url())
```

Run representative test to confirm failure:

```bash
cd apps/webhook && uv run pytest tests/unit/test_embedding_service.py::test_health_check_happy_path -v
```
Expected: FAIL until helper is integrated.

**Step 2: Implement minimal code changes**
- Replace literals in the targeted files with helper outputs.
- Keep ability to override by constructing service with explicit URLs.

**Step 3: Run updated suites**

```bash
cd apps/webhook && uv run pytest tests/unit/test_vector_store.py -v
cd apps/webhook && uv run pytest tests/unit/test_embedding_service.py -v
cd apps/webhook && uv run pytest tests/integration/test_metrics_api.py -v
cd apps/webhook && uv run pytest tests/integration/test_middleware_integration.py -v
```
Expected: PASS.

**Step 4: Commit**

```bash
git add apps/webhook/tests/unit/test_vector_store.py \
        apps/webhook/tests/unit/test_embedding_service.py \
        apps/webhook/tests/integration/test_metrics_api.py \
        apps/webhook/tests/integration/test_middleware_integration.py
git commit -m "test: use helper for remaining service endpoints"
```

---

### Task 5: Regression sweep and documentation

**Files:**
- Modify: `docs/plans/2025-11-11-python-test-service-endpoints-plan.md` (mark plan executed when done)
- Update if needed: `.docs/sessions/<timestamp>.md` for session log

**Step 1: Run full webhook test suite**

```bash
cd apps/webhook && uv run pytest -v
```
Expected: PASS.

**Step 2: Document changes**
- Note helper usage in relevant README/CLAUDE sections if necessary.

**Step 3: Final commit**

```bash
git add docs/plans/2025-11-11-python-test-service-endpoints-plan.md
# add any doc updates
git commit -m "chore: document service endpoint helper usage"
```

---

## Execution Options

Plan complete and saved to `docs/plans/2025-11-11-python-test-service-endpoints-plan.md`. Two execution options:

1. **Subagent-Driven (this session):** Dispatch fresh subagent per task with reviews between tasks for rapid iteration.
2. **Parallel Session:** Open a new session (new worktree) running superpowers:executing-plans to implement tasks in batches with checkpoints.

Which approach would you like?
