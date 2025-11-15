# Scraped Content Storage - Schema Validation

## Summary
Validated the proposed `webhook.scraped_content` table design against existing webhook schema patterns. The schema is generally sound but requires several critical corrections to match established patterns, including proper foreign key references, index naming conventions, trigger creation for timestamps, and ENUM type handling.

## Key Components
- `/compose/pulse/apps/webhook/domain/models.py` - SQLAlchemy 2.0 models with `Mapped[T]` type hints
- `/compose/pulse/apps/webhook/alembic/versions/413191e2eb2c_create_crawl_sessions_table.py` - Most recent crawl_sessions migration
- `/compose/pulse/apps/webhook/alembic/versions/20251113_add_foreign_keys.py` - Foreign key constraint patterns
- `/compose/pulse/apps/webhook/alembic/versions/20251110_000000_add_change_events.py` - Table creation with TEXT columns
- `/compose/pulse/apps/webhook/config.py` - Database configuration and settings

## Implementation Patterns

### 1. SQLAlchemy 2.0 Model Pattern
**Found in:** `/compose/pulse/apps/webhook/domain/models.py`

```python
class CrawlSession(Base):
    """Docstring with description."""
    __tablename__ = "crawl_sessions"
    __table_args__ = {"schema": "webhook"}

    # UUID primary key with default
    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    # String fields with explicit lengths
    job_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # TEXT fields (no length limit)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSONB fields
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Timestamps with timezone
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=func.now(), onupdate=func.now()
    )
```

**Key patterns:**
- Use `Mapped[T]` type hints (SQLAlchemy 2.0 style)
- Import from `sqlalchemy.dialects.postgresql` for PG-specific types
- Use `func.now()` for default timestamps (NOT `server_default`)
- Use `onupdate=func.now()` for `updated_at` columns
- JSONB fields use `dict[str, Any] | None` type hint

### 2. Foreign Key Constraints
**Found in:** `/compose/pulse/apps/webhook/alembic/versions/413191e2eb2c_create_crawl_sessions_table.py`

```python
# Recreate FK constraint with new column name
op.create_foreign_key(
    'fk_operation_metrics_crawl_id',
    'operation_metrics', 'crawl_sessions',
    ['crawl_id'], ['job_id'],
    source_schema='webhook',
    referent_schema='webhook',
    ondelete='SET NULL'
)
```

**Key patterns:**
- Use `ondelete='SET NULL'` (NOT `CASCADE`) for metric/content tables
- Both schemas must be specified: `source_schema` and `referent_schema`
- Foreign key references `job_id` column (NOT `id`) in `crawl_sessions`
- Constraint naming: `fk_{source_table}_{source_column}`

### 3. Index Creation Pattern
**Found in:** `/compose/pulse/apps/webhook/alembic/versions/20251110_000000_add_change_events.py`

```python
# B-tree index (default, explicit specification optional)
op.create_index(
    "idx_change_events_detected_at",
    "change_events",
    ["detected_at"],
    schema="webhook",
    postgresql_using="btree",  # Optional - btree is default
)

# Standard index without explicit type
op.create_index(
    "idx_change_events_watch_id",
    "change_events",
    ["watch_id"],
    schema="webhook"
)
```

**Key patterns:**
- Index naming: `idx_{table}_{column}` or `ix_webhook_{table}_{column}`
- Schema must be specified: `schema="webhook"`
- Use `postgresql_using="gin"` for JSONB columns (NOT btree)
- Composite indexes: `["col1", "col2"]` for frequently queried combinations

### 4. Table Creation with TEXT Columns
**Found in:** `/compose/pulse/apps/webhook/alembic/versions/20251110_000000_add_change_events.py`

```python
op.create_table(
    "change_events",
    sa.Column("watch_url", sa.Text(), nullable=False),
    sa.Column("diff_summary", sa.Text(), nullable=True),
    sa.Column("snapshot_url", sa.Text(), nullable=True),
    sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("NOW()"),
        nullable=False,
    ),
    sa.PrimaryKeyConstraint("id"),
    schema="webhook",
)
```

**Key patterns:**
- TEXT columns use `sa.Text()` (no length parameter)
- JSONB uses `postgresql.JSONB(astext_type=sa.Text())`
- Timestamps use `server_default=sa.text("NOW()")` in migrations
- Schema specified at table level: `schema="webhook"`

## Validation Results

### 1. Foreign Key to crawl_sessions - VALID (with corrections)

**Finding:** `webhook.crawl_sessions` table exists with these characteristics:
- Primary key: `id` (UUID)
- Unique key: `job_id` (String 255)
- Foreign keys should reference `job_id` (NOT `id`)

**Current schema validation:**
```sql
Table "webhook.crawl_sessions"
job_id             | character varying(255)   | not null | UNIQUE
Indexes:
    "crawl_sessions_pkey" PRIMARY KEY, btree (id)
    "crawl_sessions_crawl_id_key" UNIQUE CONSTRAINT, btree (job_id)
Referenced by:
    TABLE "webhook.operation_metrics" CONSTRAINT "fk_operation_metrics_crawl_id"
    FOREIGN KEY (crawl_id) REFERENCES webhook.crawl_sessions(job_id) ON DELETE SET NULL
```

**CORRECTION REQUIRED:** Foreign key should reference `job_id`, NOT `id`:
```python
# WRONG (proposed schema)
sa.ForeignKeyConstraint(
    ['job_id'],
    ['webhook.crawl_sessions.id'],  # References UUID primary key
    ondelete='CASCADE'
)

# CORRECT (matches existing pattern)
op.create_foreign_key(
    'fk_scraped_content_job_id',
    'scraped_content', 'crawl_sessions',
    ['job_id'], ['job_id'],  # References unique String(255) column
    source_schema='webhook',
    referent_schema='webhook',
    ondelete='CASCADE'  # or 'SET NULL' - see below
)
```

### 2. CASCADE vs SET NULL - REQUIRES DECISION

**Finding:** Existing foreign keys use `ondelete='SET NULL'`:
- `operation_metrics.crawl_id → crawl_sessions.job_id` uses SET NULL
- `operation_metrics.request_id → request_metrics.request_id` uses SET NULL

**Recommendation:** Use `ondelete='CASCADE'` for scraped_content:
- **Rationale:** Scraped content is tightly coupled to crawl sessions
- When a crawl session is deleted, its scraped content should be deleted
- Orphaned content has no value without session context
- Different from metrics, which have standalone analytical value

**Alternative:** Use `ondelete='SET NULL'` if:
- You want to preserve scraped content for forensic/debugging purposes
- You plan to manually manage content lifecycle
- Storage costs are not a concern

### 3. ENUM Type Creation - NO EXISTING PATTERN

**Finding:** No ENUM types exist in webhook schema:
```sql
SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace =
  (SELECT oid FROM pg_namespace WHERE nspname = 'webhook');
-- Returns: (0 rows)
```

**CORRECTION REQUIRED:** Skip ENUM creation, use String instead:
```python
# WRONG (proposed schema - creates ENUM)
from sqlalchemy import Enum
content_source = Column(Enum('scrape', 'crawl', 'map', 'search', name='content_source_type'))

# CORRECT (matches existing pattern - use String)
content_source: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
```

**Rationale:**
- No existing ENUM types in webhook schema
- String columns are easier to migrate (add new operation types)
- Consistent with `operation_type` pattern in existing tables
- Application-level validation via Pydantic

### 4. Index Strategy - CORRECTIONS REQUIRED

**Finding:** Existing indexes use these patterns:
- Simple B-tree indexes (default): `timestamp`, `status`, `operation_type`
- JSONB columns: NO GIN indexes found in webhook schema
- Composite indexes: NOT used in current schema

**CORRECTIONS REQUIRED:**

**4a. GIN Index for JSONB (proposed):**
```python
# JSONB columns should use GIN indexes
op.create_index(
    'idx_scraped_content_metadata_gin',
    'scraped_content',
    ['metadata'],
    schema='webhook',
    postgresql_using='gin'  # Essential for JSONB querying
)
```

**4b. Index Naming Convention:**
Current schema uses two conventions:
- `idx_{table}_{column}` (change_events)
- `ix_webhook_{table}_{column}` (operation_metrics, request_metrics)

**Recommendation:** Use `idx_{table}_{column}` pattern:
```python
# WRONG (inconsistent)
'ix_webhook_scraped_content_job_id'

# CORRECT (matches change_events pattern)
'idx_scraped_content_job_id'
```

**4c. Composite Index for Query Patterns:**
```python
# Add composite index for common query: (job_id, created_at)
op.create_index(
    'idx_scraped_content_job_id_created_at',
    'scraped_content',
    ['job_id', 'created_at'],
    schema='webhook'
)
```

### 5. TOAST Compression - AUTOMATIC

**Finding:** PostgreSQL 17.7 with default TOAST compression enabled:
```sql
SHOW default_toast_compression;
-- Returns: pglz
```

**Validation:** TEXT columns automatically use TOAST compression:
- Threshold: 2KB (values > 2KB are compressed and stored out-of-line)
- Compression: `pglz` (default, can be changed to `lz4` for better performance)
- No manual configuration needed in migrations

### 6. Database User and Permissions - VALID

**Finding:** Database user is `firecrawl`:
```sql
SELECT current_user;
-- Returns: firecrawl
```

**Validation:** No explicit permission grants needed:
- `firecrawl` user owns webhook schema
- All existing tables created by `firecrawl`
- Implicit ownership grants all privileges

### 7. Timestamp Trigger - NOT USED

**Finding:** `updated_at` uses SQLAlchemy `onupdate`, NOT database triggers:
```python
# In models (SQLAlchemy handles updates)
updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    nullable=False,
    default=func.now(),
    onupdate=func.now()  # No trigger needed
)

# In migration (server_default for initial value)
sa.Column(
    'updated_at',
    sa.TIMESTAMP(timezone=True),
    nullable=False,
    server_default=sa.text('NOW()')
)
```

**CORRECTION REQUIRED:** Remove trigger creation from migration:
- SQLAlchemy `onupdate=func.now()` handles automatic updates
- No need for database-level trigger function
- Simpler migration, consistent with existing pattern

## Considerations

### Critical Issues
1. **Foreign key must reference `job_id` not `id`** - Existing pattern uses unique String column
2. **No ENUM types** - Use `String(50)` instead for operation types
3. **Remove timestamp trigger** - SQLAlchemy handles `updated_at` via `onupdate`
4. **Index naming** - Use `idx_{table}_{column}` pattern, not `ix_webhook_*`

### Non-Obvious Behaviors
1. **TOAST compression is automatic** - No configuration needed for TEXT columns
2. **JSONB requires GIN indexes** - B-tree indexes don't work for JSONB containment queries
3. **Composite indexes needed** - Single column indexes on `job_id` and `created_at` won't optimize `WHERE job_id = ? ORDER BY created_at`
4. **Schema must be explicit** - All operations need `schema='webhook'` parameter

### Dependencies and Constraints
1. **Migration order** - Must run after `413191e2eb2c_create_crawl_sessions_table.py`
2. **SQLAlchemy version** - Requires 2.0+ for `Mapped[T]` type hints
3. **PostgreSQL version** - 17.7 supports all proposed features
4. **Import pattern** - Use `from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID`

### Data Size Concerns
1. **Large markdown content** - TEXT columns can store up to 1GB, TOAST handles efficiently
2. **JSONB metadata size** - Consider if `formats` should be normalized to separate table
3. **Index bloat** - Monitor `idx_scraped_content_metadata_gin` size over time
4. **Retention policy** - Consider TTL for old scraped content (e.g., 30 days)

## Next Steps

### Immediate Actions
1. **Correct foreign key reference** - Change from `crawl_sessions.id` to `crawl_sessions.job_id`
2. **Remove ENUM creation** - Use `String(50)` for `content_source` column
3. **Remove timestamp trigger** - Use SQLAlchemy `onupdate` only
4. **Fix index names** - Use `idx_*` convention, not `ix_webhook_*`

### Migration File Pattern
```python
"""Add scraped_content table

Revision ID: <generated>
Revises: 413191e2eb2c
Create Date: <timestamp>
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade() -> None:
    op.create_table(
        'scraped_content',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('job_id', sa.String(255), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('content_source', sa.String(50), nullable=False),  # NOT ENUM
        sa.Column('markdown', sa.Text(), nullable=True),
        sa.Column('html', sa.Text(), nullable=True),
        sa.Column('raw_html', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('screenshot_url', sa.String(500), nullable=True),
        sa.Column('links_extracted', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='webhook'
    )

    # Foreign key to crawl_sessions.job_id (NOT id!)
    op.create_foreign_key(
        'fk_scraped_content_job_id',
        'scraped_content', 'crawl_sessions',
        ['job_id'], ['job_id'],
        source_schema='webhook',
        referent_schema='webhook',
        ondelete='CASCADE'  # Delete content when session deleted
    )

    # Indexes
    op.create_index('idx_scraped_content_job_id', 'scraped_content',
                    ['job_id'], schema='webhook')
    op.create_index('idx_scraped_content_url', 'scraped_content',
                    ['url'], schema='webhook')
    op.create_index('idx_scraped_content_content_source', 'scraped_content',
                    ['content_source'], schema='webhook')
    op.create_index('idx_scraped_content_created_at', 'scraped_content',
                    ['created_at'], schema='webhook')

    # GIN index for JSONB metadata
    op.create_index('idx_scraped_content_metadata_gin', 'scraped_content',
                    ['metadata'], schema='webhook', postgresql_using='gin')

    # Composite index for common query pattern
    op.create_index('idx_scraped_content_job_id_created_at', 'scraped_content',
                    ['job_id', 'created_at'], schema='webhook')

def downgrade() -> None:
    op.drop_index('idx_scraped_content_job_id_created_at',
                  table_name='scraped_content', schema='webhook')
    op.drop_index('idx_scraped_content_metadata_gin',
                  table_name='scraped_content', schema='webhook')
    op.drop_index('idx_scraped_content_created_at',
                  table_name='scraped_content', schema='webhook')
    op.drop_index('idx_scraped_content_content_source',
                  table_name='scraped_content', schema='webhook')
    op.drop_index('idx_scraped_content_url',
                  table_name='scraped_content', schema='webhook')
    op.drop_index('idx_scraped_content_job_id',
                  table_name='scraped_content', schema='webhook')
    op.drop_constraint('fk_scraped_content_job_id', 'scraped_content',
                       schema='webhook', type_='foreignkey')
    op.drop_table('scraped_content', schema='webhook')
```

### SQLAlchemy Model Pattern
```python
class ScrapedContent(Base):
    """
    Stores raw scraped content from Firecrawl operations.

    Links to crawl sessions and preserves all response formats
    for downstream processing and search indexing.
    """
    __tablename__ = "scraped_content"
    __table_args__ = {"schema": "webhook"}

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    job_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    content_source: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Content in various formats
    markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    html: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata from Firecrawl response
    metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Optional fields
    screenshot_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    links_extracted: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<ScrapedContent(url={self.url}, source={self.content_source}, job={self.job_id})>"
```

### Testing Checklist
1. Verify foreign key constraint works: Insert with valid/invalid `job_id`
2. Test CASCADE delete: Delete crawl session, verify content removed
3. Check GIN index usage: Query `metadata @> '{"key": "value"}'`
4. Validate TOAST compression: Insert large markdown (>2KB), check storage
5. Test composite index: Query `WHERE job_id = ? ORDER BY created_at DESC`
6. Verify `updated_at` auto-update: Update row, check timestamp changes
