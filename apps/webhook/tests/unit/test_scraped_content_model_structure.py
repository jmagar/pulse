"""
Structural validation tests for ScrapedContent model (no DB required).

These tests validate the model structure, schema, and relationships
without requiring a database connection.
"""

from sqlalchemy import JSON, TIMESTAMP, BigInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from domain.models import CrawlSession, ScrapedContent


def test_scraped_content_table_name():
    """Test ScrapedContent uses correct table name and schema."""
    assert ScrapedContent.__tablename__ == "scraped_content"
    assert ScrapedContent.__table_args__["schema"] == "webhook"


def test_scraped_content_has_required_columns():
    """Test ScrapedContent has all required columns."""
    column_names = [c.name for c in ScrapedContent.__table__.columns]

    required_columns = [
        "id",
        "crawl_session_id",
        "url",
        "source_url",
        "content_source",
        "markdown",
        "html",
        "links",
        "screenshot",
        "metadata",
        "content_hash",
        "scraped_at",
        "created_at",
        "updated_at",
    ]

    for col in required_columns:
        assert col in column_names, f"Missing required column: {col}"


def test_scraped_content_primary_key():
    """Test ScrapedContent has correct primary key."""
    pk_cols = [c.name for c in ScrapedContent.__table__.primary_key.columns]
    assert pk_cols == ["id"]

    id_col = ScrapedContent.__table__.columns["id"]
    assert isinstance(id_col.type, BigInteger)


def test_scraped_content_foreign_key():
    """Test ScrapedContent has foreign key to crawl_sessions.job_id."""
    fks = list(ScrapedContent.__table__.foreign_keys)
    assert len(fks) == 1

    fk = fks[0]
    assert fk.parent.name == "crawl_session_id"
    assert str(fk.column) == "crawl_sessions.job_id"
    assert fk.ondelete == "CASCADE"


def test_scraped_content_column_types():
    """Test ScrapedContent columns have correct types."""
    cols = ScrapedContent.__table__.columns

    # String columns
    assert isinstance(cols["crawl_session_id"].type, String)
    assert cols["crawl_session_id"].type.length == 255

    assert isinstance(cols["content_source"].type, String)
    assert cols["content_source"].type.length == 50

    assert isinstance(cols["content_hash"].type, String)
    assert cols["content_hash"].type.length == 64

    # Text columns
    assert isinstance(cols["url"].type, Text)
    assert isinstance(cols["source_url"].type, Text)
    assert isinstance(cols["markdown"].type, Text)
    assert isinstance(cols["html"].type, Text)
    assert isinstance(cols["screenshot"].type, Text)

    # JSONB columns (conftest converts JSONB to JSON for testing)
    assert isinstance(cols["links"].type, (JSONB, JSON))
    assert isinstance(cols["metadata"].type, (JSONB, JSON))

    # Timestamp columns
    assert isinstance(cols["scraped_at"].type, TIMESTAMP)
    assert isinstance(cols["created_at"].type, TIMESTAMP)
    assert isinstance(cols["updated_at"].type, TIMESTAMP)


def test_scraped_content_nullable_constraints():
    """Test ScrapedContent nullable constraints are correct."""
    cols = ScrapedContent.__table__.columns

    # NOT NULL columns
    assert not cols["id"].nullable
    assert not cols["crawl_session_id"].nullable
    assert not cols["url"].nullable
    assert not cols["content_source"].nullable
    assert not cols["content_hash"].nullable
    assert not cols["metadata"].nullable
    assert not cols["scraped_at"].nullable
    assert not cols["created_at"].nullable
    assert not cols["updated_at"].nullable

    # Nullable columns
    assert cols["source_url"].nullable
    assert cols["markdown"].nullable
    assert cols["html"].nullable
    assert cols["links"].nullable
    assert cols["screenshot"].nullable


def test_scraped_content_relationship_to_crawl_session():
    """Test ScrapedContent has relationship to CrawlSession."""
    assert hasattr(ScrapedContent, "crawl_session")

    # Get relationship property
    rel = ScrapedContent.__mapper__.relationships["crawl_session"]
    assert rel.back_populates == "scraped_contents"


def test_crawl_session_relationship_to_scraped_content():
    """Test CrawlSession has back-reference to ScrapedContent."""
    assert hasattr(CrawlSession, "scraped_contents")

    # Get relationship property
    rel = CrawlSession.__mapper__.relationships["scraped_contents"]
    assert rel.back_populates == "crawl_session"
    assert "delete-orphan" in rel.cascade


def test_scraped_content_repr():
    """Test ScrapedContent has a __repr__ method."""
    content = ScrapedContent(
        id=1,
        crawl_session_id="test-123",
        url="https://example.com",
        content_source="firecrawl_scrape",
        content_hash="abc123",
    )

    repr_str = repr(content)
    assert "ScrapedContent" in repr_str
    assert "https://example.com" in repr_str
    assert "firecrawl_scrape" in repr_str
