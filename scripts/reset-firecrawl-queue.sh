#!/bin/bash
set -e

echo "🔍 Checking Firecrawl queue status..."
echo ""

# Check if containers are running
if ! docker ps | grep -q "pulse_redis"; then
  echo "❌ Error: pulse_redis container not running"
  exit 1
fi

# Show Redis keyspace info
echo "📊 Redis Keyspace:"
docker exec pulse_redis redis-cli INFO keyspace

echo ""
echo "📋 Bull Queue Lengths:"
wait_count=$(docker exec pulse_redis redis-cli LLEN bull:firecrawl:wait 2>/dev/null || echo "0")
active_count=$(docker exec pulse_redis redis-cli LLEN bull:firecrawl:active 2>/dev/null || echo "0")
delayed_count=$(docker exec pulse_redis redis-cli ZCARD bull:firecrawl:delayed 2>/dev/null || echo "0")
completed_count=$(docker exec pulse_redis redis-cli ZCARD bull:firecrawl:completed 2>/dev/null || echo "0")
failed_count=$(docker exec pulse_redis redis-cli ZCARD bull:firecrawl:failed 2>/dev/null || echo "0")

echo "  Waiting:   $wait_count"
echo "  Active:    $active_count"
echo "  Delayed:   $delayed_count"
echo "  Completed: $completed_count"
echo "  Failed:    $failed_count"

total_jobs=$((wait_count + active_count + delayed_count + completed_count + failed_count))
echo ""
echo "  Total Jobs: $total_jobs"

if [ "$total_jobs" -eq 0 ]; then
  echo "✅ No jobs found in queue. Nothing to clean."
  exit 0
fi

echo ""
echo "⚠️  WARNING: This will delete ALL Firecrawl jobs from the queue!"
echo "   - $active_count active jobs will be terminated"
echo "   - $wait_count waiting jobs will be removed"
echo "   - All job history will be lost"
echo ""
read -r -p "Continue? (y/N): " confirm

if [[ $confirm != [yY] ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "🛑 Stopping Firecrawl..."
docker compose stop firecrawl

echo "🗄️ Clearing PostgreSQL crawl state..."
active_crawls=$(docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -t -c "SELECT COUNT(*) FROM nuq.group_crawl WHERE status = 'active';")
queue_jobs=$(docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -t -c "SELECT COUNT(*) FROM nuq.queue_scrape;")

echo "   Found $active_crawls active crawls"
echo "   Found $queue_jobs queued jobs"

docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "DELETE FROM nuq.group_crawl WHERE status = 'active';" > /dev/null
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "DELETE FROM nuq.queue_scrape;" > /dev/null
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "DELETE FROM nuq.queue_scrape_backlog;" > /dev/null

echo "   Deleted all active crawls and queue jobs"

echo "💾 Disabling Redis persistence..."
docker exec pulse_redis redis-cli CONFIG SET appendonly no > /dev/null

echo "🧹 Clearing Bull queue keys..."
keys_deleted=$(docker exec pulse_redis redis-cli --eval - <<'EOF'
local keys = redis.call('keys', 'bull:*')
local count = #keys
for i=1,#keys,1000 do
  redis.call('unlink', unpack(keys, i, math.min(i+999, #keys)))
end
return count
EOF
)

echo "   Deleted $keys_deleted Redis keys"

echo "💾 Re-enabling Redis persistence..."
docker exec pulse_redis redis-cli CONFIG SET appendonly yes > /dev/null

echo "🔄 Restarting Firecrawl..."
docker compose start firecrawl

echo ""
echo "✅ Queue cleared successfully!"
echo ""
echo "📊 New queue status:"
docker exec pulse_redis redis-cli INFO keyspace
