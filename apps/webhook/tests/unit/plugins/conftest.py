"""
Test configuration for plugin tests.

This conftest is minimal to avoid loading the full application stack.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path so we can import plugins
webhook_dir = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(webhook_dir))

# Set minimal environment for testing
os.environ.setdefault("WEBHOOK_API_SECRET", "test-secret")
os.environ.setdefault("WEBHOOK_SECRET", "test-webhook-secret-minimum-16-chars")
os.environ.setdefault("WEBHOOK_CORS_ORIGINS", '["http://localhost:3000"]')
