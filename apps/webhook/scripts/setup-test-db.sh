#!/bin/bash
# Setup test database for webhook pytest suite

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
DB_HOST="${WEBHOOK_TEST_DB_HOST:-localhost}"
DB_PORT="${WEBHOOK_TEST_DB_PORT:-5432}"
DB_USER="${WEBHOOK_TEST_DB_USER:-firecrawl}"
DB_PASSWORD="${WEBHOOK_TEST_DB_PASSWORD:-}"
DB_NAME="${WEBHOOK_TEST_DB_NAME:-webhook_test}"
DB_SCHEMA="${WEBHOOK_TEST_DB_SCHEMA:-webhook}"
CONTAINER_NAME="${WEBHOOK_TEST_DB_CONTAINER:-pulse_postgres}"

echo "Setting up test database: ${DB_NAME}"

# Determine if we should use docker exec (if PostgreSQL client not available locally)
USE_DOCKER=false
if ! command -v psql &> /dev/null; then
    USE_DOCKER=true
    echo "PostgreSQL client not found locally, using Docker container"
fi

# Helper function to run psql commands
run_psql() {
    local db=$1
    local sql=$2

    if [ "$USE_DOCKER" = true ]; then
        docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$db" -c "$sql"
    else
        if [ -n "$DB_PASSWORD" ]; then
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -c "$sql"
        else
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -c "$sql"
        fi
    fi
}

# Check if PostgreSQL is running
if [ "$USE_DOCKER" = true ]; then
    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}✗ PostgreSQL container ${CONTAINER_NAME} is not running${NC}"
        echo "Start PostgreSQL with: docker compose up -d pulse_postgres"
        exit 1
    fi
else
    # Check if PostgreSQL is accessible via network
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" &>/dev/null; then
        echo -e "${RED}✗ PostgreSQL is not running on ${DB_HOST}:${DB_PORT}${NC}"
        echo "Start PostgreSQL with: docker compose up -d pulse_postgres"
        exit 1
    fi
fi

# Drop existing test database
run_psql "postgres" "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true

# Create fresh test database
run_psql "postgres" "CREATE DATABASE ${DB_NAME};"

# Create schema
run_psql "$DB_NAME" "CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA};"

echo -e "${GREEN}✓ Test database ${DB_NAME} created successfully${NC}"
echo "Connection string: postgresql+asyncpg://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
