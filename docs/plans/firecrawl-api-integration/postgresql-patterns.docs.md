# PostgreSQL Integration Patterns Research

## Summary
The webhook bridge uses async PostgreSQL via SQLAlchemy 2.0 with asyncpg driver, maintaining all tables in a dedicated `webhook` schema. It employs connection pooling (pool_size=20, max_overflow=10), context managers for session management, and a fire-and-forget pattern for metrics storage to avoid blocking operations. The webhook bridge currently does NOT query Firecrawl's `public` schema - it only stores its own metrics and change event data in the `webhook` schema.

## Key Components

### Database Configuration
- `/compose/pulse/apps/webhook/config.py`: Pydantic settings with environment-based configuration
- `/compose/pulse/apps/webhook/infra/database.py`: Async engine, session factory, and context managers
- `/compose/pulse/apps/webhook/alembic/env.py`: Alembic async migration support

### SQLAlchemy Models
- `/compose/pulse/apps/webhook/domain/models.py`: All models in `webhook` schema
  - `RequestMetric`: HTTP request timings with indexes on timestamp, method, path, status
  - `OperationMetric`: Operation-level timings with indexes on operation_type, crawl_id, document_url
  - `ChangeEvent`: changedetection.io event tracking
  - `CrawlSession`: Firecrawl v2 job lifecycle and aggregate metrics

### Service Layer
- `/compose/pulse/apps/webhook/services/crawl_session.py`: CRUD operations for CrawlSession
- `/compose/pulse/apps/webhook/api/routers/metrics.py`: Query endpoints with aggregation and filtering
- `/compose/pulse/apps/webhook/workers/jobs.py`: Background job with multi-transaction pattern

### Migrations
- `/compose/pulse/apps/webhook/alembic/versions/`: 8 migrations, all targeting `webhook` schema
- `20251109_100516_add_webhook_schema.py`: Created `webhook` schema and migrated tables from `public`

## Implementation Patterns

### 1. Connection Pooling and Engine Setup
**Location:** `/compose/pulse/apps/webhook/infra/database.py`

```python
# Async engine with connection pooling
engine = create_async_engine(
    settings.database_url,  # postgresql+asyncpg://user:pass@host:port/db
    echo=False,
    pool_pre_ping=True,      # Verify connections before using
    pool_size=20,            # Base connection pool
    max_overflow=10,         # Additional connections when pool exhausted
)

# Session factory with proper defaults
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Don't expire objects after commit
    autocommit=False,        # Explicit commits required
    autoflush=False,         # Manual flush control
)
```

**Key Settings:**
- `database_url`: Uses `AliasChoices` to support `WEBHOOK_DATABASE_URL`, `DATABASE_URL`, or `SEARCH_BRIDGE_DATABASE_URL`
- Default: `postgresql+asyncpg://fc_bridge:changeme@localhost:5432/fc_bridge`
- Async driver: `asyncpg` (NOT psycopg2)

### 2. Session Management Patterns

**Pattern A: Dependency Injection (FastAPI routes)**
```python
# /compose/pulse/apps/webhook/infra/database.py
async def get_db_session() -> AsyncGenerator[AsyncSession]:
    """Provide database session for FastAPI dependency injection."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()  # Auto-commit on success
        except Exception:
            await session.rollback()  # Auto-rollback on error
            raise
        finally:
            await session.close()

# Usage in routes
@router.get("/metrics/requests")
async def get_request_metrics(
    db: Annotated[AsyncSession, Depends(get_db_session)],
):
    result = await db.execute(select(RequestMetric).limit(100))
    return result.scalars().all()
```

**Pattern B: Context Manager (Background jobs, utilities)**
```python
# /compose/pulse/apps/webhook/infra/database.py
@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession]:
    """Provide database session for async context manager usage."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()  # Auto-commit on success
        except Exception:
            await session.rollback()  # Auto-rollback on error
            raise
        finally:
            await session.close()

# Usage in workers and utilities
async with get_db_context() as db:
    db.add(metric)
    await db.commit()  # Explicit commit available if needed
```

### 3. Fire-and-Forget Metrics Storage
**Location:** `/compose/pulse/apps/webhook/utils/timing.py`

The webhook bridge uses a **non-blocking metrics pattern** to avoid impacting operation performance:

```python
class TimingContext:
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # Calculate timing
        self.duration_ms = (time.perf_counter() - self.start_time) * 1000

        # Log immediately (fast)
        logger.info("Operation completed", duration_ms=self.duration_ms)

        # Store to database (fire-and-forget)
        try:
            async with get_db_context() as db:
                metric = OperationMetric(
                    operation_type=self.operation_type,
                    duration_ms=self.duration_ms,
                    crawl_id=self.crawl_id,  # Links to CrawlSession
                    # ...
                )
                db.add(metric)
                await db.commit()
        except Exception as db_error:
            # Don't fail the operation if metrics storage fails
            logger.warning("Failed to store metric", error=str(db_error))
```

**Key Pattern:** Metrics failures never propagate to the calling operation.

### 4. Multi-Transaction Pattern (Complex Operations)
**Location:** `/compose/pulse/apps/webhook/workers/jobs.py`

For long-running operations with external API calls, webhook bridge uses a **three-transaction pattern**:

```python
async def rescrape_changed_url(change_event_id: int):
    # TRANSACTION 1: Mark as in_progress (commit immediately)
    async with get_db_context() as session:
        change_event = await session.execute(
            select(ChangeEvent).where(ChangeEvent.id == change_event_id)
        )
        await session.execute(
            update(ChangeEvent)
            .where(ChangeEvent.id == change_event_id)
            .values(rescrape_status="in_progress")
        )
        await session.commit()  # Release DB lock immediately

    # PHASE 2: External operations (no DB transaction held)
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{firecrawl_url}/v2/scrape", ...)
        doc_id = await _index_document_helper(url, text, metadata)
    except Exception as e:
        # TRANSACTION 3a: Update failure status (separate transaction)
        async with get_db_context() as session:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(rescrape_status=f"failed: {str(e)}")
            )
            await session.commit()
        raise

    # TRANSACTION 3b: Update success status (separate transaction)
    async with get_db_context() as session:
        await session.execute(
            update(ChangeEvent)
            .where(ChangeEvent.id == change_event_id)
            .values(rescrape_status="completed", indexed_at=datetime.now(UTC))
        )
        await session.commit()
```

**Why:** Avoids holding DB locks during 120+ second HTTP operations, allows zombie job detection.

### 5. Query Patterns with Aggregation
**Location:** `/compose/pulse/apps/webhook/api/routers/metrics.py`

```python
# Complex aggregation with grouping
stats_query = (
    select(
        OperationMetric.operation_type,
        func.avg(OperationMetric.duration_ms).label("avg_duration_ms"),
        func.count().label("total_operations"),
        func.sum(func.cast(OperationMetric.success, sa.Integer)).label("successful_operations"),
    )
    .where(OperationMetric.timestamp >= time_cutoff)
    .group_by(OperationMetric.operation_type)
)
stats_result = await db.execute(stats_query)
stats_by_type = {row.operation_type: {...} for row in stats_result.all()}

# Simple SELECT with filtering
result = await db.execute(
    select(CrawlSession)
    .where(CrawlSession.job_id == job_id)
)
session = result.scalar_one_or_none()

# Pagination pattern
query = (
    select(RequestMetric)
    .where(RequestMetric.timestamp >= time_cutoff)
    .order_by(desc(RequestMetric.timestamp))
    .limit(limit)
    .offset(offset)
)
result = await db.execute(query)
metrics = result.scalars().all()
```

### 6. Schema Isolation
**Location:** `/compose/pulse/apps/webhook/domain/models.py`

All webhook models explicitly declare `__table_args__ = {"schema": "webhook"}`:

```python
class CrawlSession(Base):
    __tablename__ = "crawl_sessions"
    __table_args__ = {"schema": "webhook"}  # Explicit schema

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    job_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    # ... 20+ columns with type hints and mapped_column
```

**Migration Pattern:**
```python
# /compose/pulse/apps/webhook/alembic/versions/20251109_100516_add_webhook_schema.py
def upgrade():
    op.execute("CREATE SCHEMA IF NOT EXISTS webhook")
    op.execute("ALTER TABLE public.request_metrics SET SCHEMA webhook")
    op.execute("ALTER TABLE public.operation_metrics SET SCHEMA webhook")
```

## Considerations

### Performance Optimizations
1. **Indexes on all filter/join columns:**
   - `RequestMetric`: timestamp, method, path, status_code, request_id
   - `OperationMetric`: timestamp, operation_type, crawl_id, document_url, job_id
   - `CrawlSession`: started_at, status, job_id (unique)
   - `ChangeEvent`: watch_id, detected_at

2. **Connection Pooling:** 20 base + 10 overflow = 30 max concurrent connections
   - `pool_pre_ping=True` ensures healthy connections
   - Async context managers ensure proper cleanup

3. **JSONB for Flexible Metadata:**
   - `extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB)`
   - Avoids schema changes for new metadata fields
   - PostgreSQL JSONB supports GIN indexes if needed

4. **Fire-and-Forget Metrics:** Non-blocking writes prevent performance impact

### Schema Isolation Strategy
- **Webhook schema:** All webhook bridge tables isolated from Firecrawl's `public` schema
- **No cross-schema queries:** Webhook bridge does NOT query Firecrawl's tables
- **Migration safety:** `ALTER TABLE ... SET SCHEMA` moves tables atomically

### Database URL Configuration Priority
1. `WEBHOOK_DATABASE_URL` (highest priority)
2. `DATABASE_URL` (shared infrastructure)
3. `SEARCH_BRIDGE_DATABASE_URL` (legacy)

**Default:** `postgresql+asyncpg://fc_bridge:changeme@localhost:5432/fc_bridge`

### Transaction Patterns
- **Single transaction:** Most CRUD operations (automatic via `get_db_session()` or `get_db_context()`)
- **Multi-transaction:** Long-running operations with external API calls (explicit commits)
- **Fire-and-forget:** Metrics storage (isolated try/except, never propagates errors)

### Type Safety
- **SQLAlchemy 2.0 `Mapped[T]`:** All columns use type hints
- **Pydantic models:** API schemas with runtime validation
- **PostgreSQL-specific types:** `UUID`, `JSONB`, `DateTime(timezone=True)`

### Async Patterns
- **Always use `await`:** All database operations are async
- **Context managers:** Automatic session cleanup via `async with`
- **No sync code:** Pure async stack (FastAPI → SQLAlchemy → asyncpg → PostgreSQL)

## Next Steps

### For Firecrawl API Integration

1. **Decide on Schema Strategy:**
   - Option A: Create new `firecrawl` schema for API-specific tables
   - Option B: Use existing `public` schema (matches Firecrawl container)
   - Option C: Add tables to `webhook` schema (simpler but less isolated)

2. **Reuse Database Connection:**
   - Use same `database_url` configuration pattern
   - Share connection pool with webhook bridge
   - Create separate session factory if needed for schema isolation

3. **Model Definition Pattern:**
   ```python
   # apps/api/domain/models.py (new file)
   from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

   class Base(DeclarativeBase):
       pass

   class ScrapeJob(Base):
       __tablename__ = "scrape_jobs"
       __table_args__ = {"schema": "firecrawl"}  # Or "public"

       id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
       # ... follow webhook bridge patterns
   ```

4. **Session Management:**
   - Copy `infra/database.py` pattern to `apps/api/`
   - Use `get_db_session()` for FastAPI routes
   - Use `get_db_context()` for background workers

5. **Querying Firecrawl Container's Tables:**
   - If querying existing Firecrawl tables in `public` schema:
     ```python
     # Define models pointing to existing tables
     class FirecrawlCrawl(Base):
         __tablename__ = "crawls"
         __table_args__ = {"schema": "public"}
         # Match existing column structure
     ```
   - Use SQLAlchemy reflection if schema unknown:
     ```python
     from sqlalchemy import MetaData, Table
     metadata = MetaData(schema="public")
     await metadata.reflect(bind=engine)
     crawls_table = metadata.tables["public.crawls"]
     ```

6. **Alembic Migrations:**
   - Create `apps/api/alembic/` with same structure as webhook
   - Point to Firecrawl database
   - Use schema-qualified names in migrations

7. **Performance Considerations:**
   - Index all foreign keys and frequently queried columns
   - Use JSONB for flexible metadata (like webhook bridge)
   - Consider read replicas if querying high-traffic Firecrawl tables
   - Use `pool_pre_ping=True` for reliability across network

8. **Avoid These Pitfalls:**
   - Don't use sync database drivers (psycopg2) - use asyncpg
   - Don't hold transactions during HTTP calls - use multi-transaction pattern
   - Don't propagate metrics failures - use fire-and-forget pattern
   - Don't skip schema declaration - explicit `__table_args__` required
   - Don't use `autocommit=True` - explicit commits for clarity
