#!/bin/bash
set -e

echo "🔍 Checking webhook indexing queue status..."
echo ""

# Check if containers are running
if ! docker ps | grep -q "pulse_redis"; then
  echo "❌ Error: pulse_redis container not running"
  exit 1
fi

# Show RQ queue stats
echo "📋 RQ Indexing Queue:"
queue_length=$(docker exec pulse_redis redis-cli LLEN "rq:queue:indexing" 2>/dev/null || echo "0")
started_length=$(docker exec pulse_redis redis-cli ZCARD "rq:queue:indexing:started" 2>/dev/null || echo "0")
failed_length=$(docker exec pulse_redis redis-cli ZCARD "rq:queue:indexing:failed" 2>/dev/null || echo "0")
finished_length=$(docker exec pulse_redis redis-cli ZCARD "rq:queue:indexing:finished" 2>/dev/null || echo "0")

echo "  Queued:    $queue_length"
echo "  Started:   $started_length"
echo "  Failed:    $failed_length"
echo "  Finished:  $finished_length"

total_jobs=$((queue_length + started_length + failed_length + finished_length))
echo ""
echo "  Total Jobs: $total_jobs"

if [ "$total_jobs" -eq 0 ]; then
  echo "✅ No jobs found in queue. Nothing to clean."
  exit 0
fi

echo ""
echo "⚠️  WARNING: This will delete ALL webhook indexing jobs from the queue!"
echo "   - $started_length active jobs will be terminated"
echo "   - $queue_length waiting jobs will be removed"
echo "   - All job history will be lost"
echo ""
read -p "Continue? (y/N): " confirm

if [[ $confirm != [yY] ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "🛑 Stopping webhook workers..."
docker compose stop pulse_webhook-worker

echo "💾 Disabling Redis persistence..."
docker exec pulse_redis redis-cli CONFIG SET appendonly no > /dev/null

echo "🧹 Clearing RQ queue keys..."
keys_deleted=$(docker exec pulse_redis redis-cli EVAL "local keys = redis.call('keys', 'rq:*'); local count = #keys; for i=1,#keys,1000 do redis.call('unlink', unpack(keys, i, math.min(i+999, #keys))) end; return count" 0)

echo "   Deleted $keys_deleted Redis keys"

echo "💾 Re-enabling Redis persistence..."
docker exec pulse_redis redis-cli CONFIG SET appendonly yes > /dev/null

echo "🔄 Starting webhook workers..."
docker compose up -d --scale pulse_webhook-worker=8 pulse_webhook-worker

echo ""
echo "✅ Queue cleared successfully!"
echo ""
echo "📊 New queue status:"
docker exec pulse_redis redis-cli LLEN "rq:queue:indexing"
