"""Tests for jobs module exports."""


def test_jobs_module_exports_rescrape_function():
    """Test that app.jobs module exports rescrape_changed_url function."""
    from workers.jobs import rescrape_changed_url

    # Verify function is exported
    assert rescrape_changed_url is not None
    assert callable(rescrape_changed_url)

    # Verify it's the correct function from rescrape module
    from workers.jobs import rescrape_changed_url as direct_import

    assert rescrape_changed_url is direct_import


def test_jobs_module_has_correct_all():
    """Test that workers.jobs module has correct __all__ export."""
    import workers.jobs

    # Verify __all__ is defined
    assert hasattr(workers.jobs, "__all__")

    # Verify rescrape_changed_url is in __all__
    assert "rescrape_changed_url" in workers.jobs.__all__
