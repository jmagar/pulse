#!/bin/bash
# Validate pnpm filter patterns match actual workspace packages

set -e

echo "🔍 Validating pnpm workspace filter patterns..."

# Extract filter patterns from package.json
FILTERS=$(grep -o "'./apps/[^']*'" package.json | sort -u)

# Check each filter pattern
FAILED=0
for FILTER in $FILTERS; do
  # Remove quotes
  PATTERN=$(echo "$FILTER" | tr -d "'")

  # Test if pattern matches any packages
  MATCHED=$(pnpm --filter "$PATTERN" list 2>&1 || true)

  if echo "$MATCHED" | grep -q "No projects matched"; then
    echo "❌ FAILED: Filter pattern $FILTER matches no packages"
    FAILED=1
  else
    echo "✅ PASS: Filter pattern $FILTER is valid"
  fi
done

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "❌ pnpm filter validation failed!"
  echo "💡 Tip: Use './apps/mcp' not './apps/mcp/*' for single packages"
  exit 1
fi

echo ""
echo "✅ All pnpm filter patterns are valid"
exit 0
