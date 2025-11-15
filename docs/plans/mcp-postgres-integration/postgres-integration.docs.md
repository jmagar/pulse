# PostgreSQL Integration Research - MCP Server

## Summary

The MCP server already has robust PostgreSQL infrastructure in place. The `pg` (node-postgres) package is installed with TypeScript types, and there's an existing pattern for database connections used by the OAuth token storage system. The monorepo uses a shared PostgreSQL instance (`pulse_postgres`) with schema-based isolation: `public` schema for Firecrawl API data and `webhook` schema for webhook bridge data. MCP currently stores OAuth tokens in the `public` schema but does not yet have a dedicated schema.

**Key findings:**
- PostgreSQL client library (`pg`) is already installed and configured
- Existing connection patterns use `Pool` from `pg` package
- Environment variable `MCP_DATABASE_URL` is already supported (falls back to `DATABASE_URL` and `NUQ_DATABASE_URL`)
- Factory pattern for storage abstraction (PostgreSQL, Redis, or filesystem)
- No TypeScript ORM is used - raw SQL queries with parameterized statements
- Simple SQL migration files in `/compose/pulse/apps/mcp/migrations/`
- Python webhook service uses SQLAlchemy with `__table_args__ = {"schema": "webhook"}` pattern

## Key Components

### Database Infrastructure
- `/compose/pulse/apps/mcp/server/storage/postgres-store.ts` - PostgreSQL token store implementation
- `/compose/pulse/apps/mcp/server/storage/factory.ts` - Storage backend factory (PostgreSQL, Redis, filesystem)
- `/compose/pulse/apps/mcp/server/storage/token-store.ts` - Storage interface and serialization utilities
- `/compose/pulse/apps/mcp/server/oauth/audit-logger.ts` - Singleton Pool pattern for audit logging
- `/compose/pulse/apps/mcp/config/environment.ts` - Centralized environment variable management
- `/compose/pulse/apps/mcp/migrations/20251112_oauth_tokens.sql` - SQL migration example

### Python Reference (Webhook Service)
- `/compose/pulse/apps/webhook/infra/database.py` - SQLAlchemy async session management
- `/compose/pulse/apps/webhook/domain/models.py` - Schema-aware SQLAlchemy models
- `/compose/pulse/apps/webhook/alembic/versions/20251109_100516_add_webhook_schema.py` - Schema creation migration

## Implementation Patterns

### PostgreSQL Connection Pattern
**Current implementation** (from `server/storage/factory.ts`):
```typescript
import { Pool } from "pg";
import { env } from "../../config/environment.js";

if (env.databaseUrl) {
  const pool = new Pool({ connectionString: env.databaseUrl });
  cachedStore = createPostgresTokenStore(pool);
}
```

**Singleton pool pattern** (from `server/oauth/audit-logger.ts`):
```typescript
import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.MCP_DATABASE_URL });
  }
  return pool;
}
```

### SQL Query Pattern
**Parameterized queries** (from `server/storage/postgres-store.ts`):
```typescript
const UPSERT_SQL = `
INSERT INTO oauth_tokens (
  user_id, session_id, access_token, refresh_token, token_type,
  expires_at, scopes, id_token, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (user_id) DO UPDATE SET
  session_id = EXCLUDED.session_id,
  access_token = EXCLUDED.access_token,
  ...
RETURNING *;
`;

async function save(record: TokenRecord): Promise<void> {
  await pool.query(UPSERT_SQL, [
    serialized.userId,
    serialized.sessionId,
    // ... parameters
  ]);
}
```

### Type Mapping Pattern
**Database row to TypeScript object** (from `server/storage/postgres-store.ts`):
```typescript
interface DbTokenRow {
  user_id: string;
  session_id: string;
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_at: Date | string;
  scopes: string[];
  id_token?: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToRecord(row: DbTokenRow): TokenRecord {
  return {
    userId: row.user_id,
    sessionId: row.session_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? undefined,
    tokenType: row.token_type,
    expiresAt: new Date(row.expires_at),
    scopes: row.scopes,
    idToken: row.id_token ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
```

### Migration Pattern
**Simple SQL files** (from `migrations/20251112_oauth_tokens.sql`):
```sql
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE,
    -- ... columns
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at
    ON oauth_tokens (expires_at);

CREATE OR REPLACE FUNCTION set_oauth_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_oauth_tokens_updated_at
BEFORE UPDATE ON oauth_tokens
FOR EACH ROW
EXECUTE PROCEDURE set_oauth_tokens_updated_at();
```

### Schema Isolation (Python Reference)
**SQLAlchemy pattern** (from `apps/webhook/domain/models.py`):
```python
class RequestMetric(Base):
    __tablename__ = "request_metrics"
    __table_args__ = {"schema": "webhook"}

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    # ... fields
```

**Schema creation** (from webhook migration):
```sql
CREATE SCHEMA IF NOT EXISTS webhook;
ALTER TABLE public.request_metrics SET SCHEMA webhook;
```

## Considerations

### Database Connection Management
- **Singleton pattern**: Both `factory.ts` (cached store) and `audit-logger.ts` (singleton pool) use caching to prevent multiple connections
- **Connection pooling**: `Pool` from `pg` provides automatic connection pooling
- **No explicit configuration**: Pool size defaults used (no custom `pool_size`, `max_overflow` settings like Python SQLAlchemy)
- **No health checks**: No pre-startup database connectivity validation (unlike webhook service)

### Environment Variables
- **Primary**: `MCP_DATABASE_URL` (preferred for namespacing)
- **Fallbacks**: `DATABASE_URL`, `NUQ_DATABASE_URL` (backward compatibility)
- **Already configured**: `.env.example` line 73 shows `NUQ_DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@pulse_postgres:5432/${POSTGRES_DB}`
- **No separate schema config**: No `MCP_DATABASE_SCHEMA` variable (could add for future isolation)

### Schema Isolation Strategy
- **Firecrawl API**: Uses `public` schema (default)
- **Webhook Bridge**: Uses `webhook` schema (explicit)
- **MCP OAuth**: Uses `public` schema (implicit, no schema prefix in table names)
- **Recommendation**: Create `mcp` schema for MCP-specific tables to isolate from Firecrawl API data
- **Migration impact**: Need to move `oauth_tokens` table to `mcp` schema or create schema-prefixed tables for new features

### TypeScript vs Python Patterns
**TypeScript (MCP):**
- No ORM - raw SQL with parameterized queries
- Manual type mapping (snake_case DB → camelCase TS)
- Simple `.sql` migration files
- Factory pattern for storage abstraction
- Interface-based abstractions (`TokenStore`)

**Python (Webhook):**
- SQLAlchemy ORM with async support
- Declarative models with type hints (`Mapped[T]`)
- Alembic for database migrations
- Explicit schema declaration in `__table_args__`
- FastAPI dependency injection for sessions

### Migration Management
- **No formal migration runner**: MCP uses simple `.sql` files without version tracking
- **Manual execution**: Migrations must be run manually (no `migrate up/down` commands)
- **No Alembic equivalent**: Unlike webhook service which uses Alembic for version control
- **Risk**: Could lead to schema drift if migrations aren't tracked properly
- **Recommendation**: Consider simple migration tracking (version table) or adopt TypeScript migration tool

### Type Safety Considerations
- **@types/pg installed**: TypeScript types available for `pg` package
- **Query results typed as `any`**: `pool.query()` returns `QueryResult<any>` by default
- **Manual type guards needed**: Must cast `result.rows[0]` to interface type
- **Example**: `result.rows[0] as DbTokenRow`
- **No runtime validation**: No Zod/Yup validation on database reads (unlike API boundaries)

### Connection String Format
- **PostgreSQL format**: `postgres://user:password@host:port/database`
- **Internal Docker**: `postgres://firecrawl:password@pulse_postgres:5432/pulse_postgres`
- **Schema not in URL**: PostgreSQL schema specified in queries, not connection string
- **SSL not configured**: No `?sslmode=require` in connection strings (trusted internal network)

### Error Handling
- **No explicit error handling**: `postgres-store.ts` doesn't wrap `pool.query()` in try/catch
- **Relies on caller**: Errors bubble up to callers (e.g., `TokenManager`, OAuth routes)
- **Pool errors**: Connection failures throw but aren't logged at query level
- **Recommendation**: Add structured logging for database errors

### Testing Considerations
- **No database mocks in tests**: `@types/pg` installed in devDependencies but no test fixtures found
- **Webhook service pattern**: Uses test database setup script (`apps/webhook/scripts/setup-test-db.sh`)
- **Recommendation**: Create test database setup for MCP if adding complex database logic
- **In-memory fallback**: Factory pattern allows filesystem storage for tests without database

### Performance Considerations
- **No connection pool tuning**: Uses default `pg` pool settings
- **No query optimization**: No indexes documented for OAuth token lookups (only `expires_at`)
- **No query logging**: `echo=False` equivalent not configurable in MCP (unlike webhook service)
- **Webhook comparison**: Webhook sets `pool_size=20`, `max_overflow=10` explicitly

### Security Considerations
- **Parameterized queries**: All queries use `$1, $2` placeholders (prevents SQL injection)
- **No raw string interpolation**: Good pattern followed in existing code
- **Token encryption**: OAuth tokens encrypted before storage (see `token-manager.ts`)
- **No schema isolation**: OAuth tokens in `public` schema (accessible to Firecrawl API if it had read access)
- **Recommendation**: Move sensitive MCP data to dedicated `mcp` schema

## Next Steps

### For MCP-Specific Database Features

1. **Create MCP Schema**
   - Add migration: `CREATE SCHEMA IF NOT EXISTS mcp;`
   - Isolate MCP data from Firecrawl API and webhook bridge
   - Migrate `oauth_tokens` to `mcp` schema or create new tables there

2. **Adopt Existing Patterns**
   - Use `Pool` from `pg` package (already installed)
   - Follow `postgres-store.ts` pattern for SQL queries
   - Use factory pattern for testability (PostgreSQL, Redis, or filesystem fallback)
   - Define TypeScript interfaces for database rows with snake_case fields
   - Create mapping functions (`rowToRecord`) for camelCase transformation

3. **Environment Configuration**
   - Use `env.databaseUrl` from `config/environment.ts`
   - No new environment variables needed (already supports `MCP_DATABASE_URL`)
   - Consider adding `MCP_DATABASE_SCHEMA` for future flexibility

4. **Migration Strategy**
   - Create `.sql` files in `/compose/pulse/apps/mcp/migrations/`
   - Use `CREATE TABLE IF NOT EXISTS` for idempotency
   - Add indexes for frequently queried columns
   - Consider migration version tracking table

5. **Connection Management**
   - Use singleton pool pattern (see `audit-logger.ts`)
   - Let `pg` handle connection pooling automatically
   - Add graceful shutdown handler to close pool on exit
   - Consider health check endpoint for database connectivity

6. **Type Safety**
   - Define interfaces for database rows (snake_case)
   - Define interfaces for TypeScript models (camelCase)
   - Create type guards or Zod schemas for runtime validation
   - Type assert query results: `result.rows[0] as DbRow`

7. **Error Handling**
   - Wrap queries in try/catch for structured logging
   - Log database errors with context (table, operation, params)
   - Return null for "not found" vs throwing for errors
   - Handle connection failures gracefully

8. **Testing**
   - Create test database setup script (similar to webhook service)
   - Use factory pattern to inject mock stores in tests
   - Consider in-memory SQLite for unit tests (via `better-sqlite3`)
   - Integration tests should use real PostgreSQL

### Alternative: Use Existing Webhook Service Tables

If the feature involves indexing or search:
- **Leverage webhook bridge**: Use webhook service's existing SQLAlchemy models
- **HTTP API**: Query webhook bridge via `MCP_WEBHOOK_BASE_URL`
- **Pros**: No MCP database code needed, reuse existing infrastructure
- **Cons**: Adds HTTP overhead, couples MCP to webhook service availability

### PostgreSQL Client Recommendations

**Already installed: `pg` (node-postgres)**
- ✅ Industry standard, mature, well-documented
- ✅ TypeScript types included (`@types/pg`)
- ✅ Connection pooling built-in
- ✅ Supports async/await
- ✅ Parameterized queries prevent SQL injection
- ✅ Already used in codebase (consistency)

**Alternatives NOT recommended:**
- ❌ `postgres.js` - Would require adding new dependency
- ❌ `typeorm` / `mikro-orm` - Adds complexity, violates KISS principle
- ❌ `prisma` - Requires code generation, not suitable for lightweight usage
- ❌ `kysely` - Type-safe query builder, but unnecessary for simple queries

**Verdict**: Continue using `pg` package. It's already installed, well-proven, and matches the existing patterns in the codebase.

## Database Schema Reference

### Shared PostgreSQL Instance: `pulse_postgres`

**Schemas:**
- `public` - Firecrawl API data (NuQ jobs, authentication if enabled)
- `webhook` - Webhook bridge data (metrics, crawl sessions, change events)
- `mcp` - (Proposed) MCP server data (OAuth tokens, future features)

**Connection Details:**
- **Host**: `pulse_postgres` (Docker network) or `localhost:50105` (external)
- **Database**: `pulse_postgres`
- **User**: `firecrawl` (from `POSTGRES_USER`)
- **Password**: From `POSTGRES_PASSWORD` env var
- **Connection String**: `postgres://firecrawl:${POSTGRES_PASSWORD}@pulse_postgres:5432/pulse_postgres`

### Existing MCP Tables (in `public` schema)

**`oauth_tokens` table:**
```sql
CREATE TABLE oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE,
    session_id VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scopes TEXT[] NOT NULL,
    id_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_oauth_tokens_expires_at ON oauth_tokens (expires_at);
```

**`oauth_audit_log` table:**
```sql
CREATE TABLE oauth_audit_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Webhook Service Tables (in `webhook` schema)

**`request_metrics`, `operation_metrics`, `change_events`, `crawl_sessions`** - See `/compose/pulse/apps/webhook/domain/models.py` for full schema definitions.

## Code Examples

### Creating a Database Connection

```typescript
import { Pool } from "pg";
import { env } from "../../config/environment.js";

let pool: Pool | null = null;

export function getDatabasePool(): Pool {
  if (!pool) {
    if (!env.databaseUrl) {
      throw new Error("Database URL not configured");
    }
    pool = new Pool({
      connectionString: env.databaseUrl,
      // Optional tuning:
      // max: 20,                  // Maximum pool size
      // idleTimeoutMillis: 30000, // Close idle clients after 30s
      // connectionTimeoutMillis: 2000, // Fail fast on connection errors
    });
  }
  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

### Executing Queries

```typescript
interface MyTableRow {
  id: string;
  created_at: Date;
  some_field: string;
}

export async function getRecord(id: string): Promise<MyTableRow | null> {
  const pool = getDatabasePool();
  const result = await pool.query(
    "SELECT id, created_at, some_field FROM mcp.my_table WHERE id = $1",
    [id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] as MyTableRow;
}

export async function createRecord(data: { someField: string }): Promise<string> {
  const pool = getDatabasePool();
  const result = await pool.query(
    "INSERT INTO mcp.my_table (some_field) VALUES ($1) RETURNING id",
    [data.someField]
  );

  return result.rows[0].id;
}
```

### Migration File Template

```sql
-- Migration: 20250115_create_my_table.sql
-- Description: Create my_table in mcp schema

-- Ensure mcp schema exists
CREATE SCHEMA IF NOT EXISTS mcp;

-- Create table
CREATE TABLE IF NOT EXISTS mcp.my_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    some_field VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_my_table_some_field
    ON mcp.my_table (some_field);

-- Create update trigger
CREATE OR REPLACE FUNCTION mcp.set_my_table_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_my_table_updated_at ON mcp.my_table;
CREATE TRIGGER trg_my_table_updated_at
BEFORE UPDATE ON mcp.my_table
FOR EACH ROW
EXECUTE PROCEDURE mcp.set_my_table_updated_at();
```

## References

- **PostgreSQL client**: [node-postgres documentation](https://node-postgres.com/)
- **TypeScript types**: `@types/pg` (already installed in devDependencies)
- **Existing patterns**: `/compose/pulse/apps/mcp/server/storage/postgres-store.ts`
- **Migration examples**: `/compose/pulse/apps/mcp/migrations/20251112_oauth_tokens.sql`
- **Python reference**: `/compose/pulse/apps/webhook/infra/database.py` (SQLAlchemy async)
- **Environment config**: `/compose/pulse/apps/mcp/config/environment.ts`
