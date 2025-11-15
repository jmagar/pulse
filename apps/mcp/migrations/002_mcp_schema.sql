-- Migration: Create MCP schema for resource storage
-- Date: 2025-01-15
-- Description: PostgreSQL-backed resource storage for MCP server

CREATE SCHEMA IF NOT EXISTS mcp;

-- Set schema isolation (all future tables in mcp schema)
SET search_path TO mcp, public;

-- Resources table
CREATE TABLE IF NOT EXISTS mcp.resources (
  id BIGSERIAL PRIMARY KEY,
  uri TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('raw', 'cleaned', 'extracted')),
  content_type TEXT NOT NULL DEFAULT 'text/markdown',
  source TEXT NOT NULL DEFAULT 'unknown',
  extraction_prompt TEXT,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_ms BIGINT,
  expires_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_resources_url ON mcp.resources (url);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON mcp.resources (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_uri ON mcp.resources (uri);
CREATE INDEX IF NOT EXISTS idx_resources_expires_at ON mcp.resources (expires_at)
  WHERE expires_at IS NOT NULL;

-- Composite index for cache lookups (url + extraction_prompt)
CREATE INDEX IF NOT EXISTS idx_resources_cache_lookup ON mcp.resources (url, extraction_prompt)
  WHERE resource_type IN ('cleaned', 'extracted');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION mcp.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_resources_updated_at
  BEFORE UPDATE ON mcp.resources
  FOR EACH ROW
  EXECUTE FUNCTION mcp.update_updated_at_column();

-- Trigger for expires_at calculation
CREATE OR REPLACE FUNCTION mcp.calculate_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ttl_ms IS NOT NULL AND NEW.ttl_ms > 0 THEN
    NEW.expires_at = NEW.created_at + (NEW.ttl_ms || ' milliseconds')::INTERVAL;
  ELSE
    NEW.expires_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_expires_at
  BEFORE INSERT OR UPDATE ON mcp.resources
  FOR EACH ROW
  EXECUTE FUNCTION mcp.calculate_expires_at();

-- Auto-cleanup function (call via cron or trigger)
CREATE OR REPLACE FUNCTION mcp.cleanup_expired_resources()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM mcp.resources
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Auto-cleanup trigger (runs on INSERT to avoid cron dependency)
-- WARNING: Adds overhead to every insert, but ensures timely cleanup
CREATE OR REPLACE FUNCTION mcp.auto_cleanup_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Only cleanup if random(100) < 5 (5% of inserts trigger cleanup)
  IF random() < 0.05 THEN
    PERFORM mcp.cleanup_expired_resources();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_cleanup
  AFTER INSERT ON mcp.resources
  FOR EACH STATEMENT
  EXECUTE FUNCTION mcp.auto_cleanup_on_insert();

-- Grant permissions (if using separate db user for MCP)
GRANT USAGE ON SCHEMA mcp TO firecrawl;
GRANT ALL ON ALL TABLES IN SCHEMA mcp TO firecrawl;
GRANT ALL ON ALL SEQUENCES IN SCHEMA mcp TO firecrawl;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mcp TO firecrawl;
