#!/bin/bash
cd "$(dirname "$0")/frontend"

# Skip Prisma generate for faster startup (will generate on first use if needed)
export SKIP_PRISMA_GENERATE=true

# Kill any existing vite process
pkill -f "vite dev" 2>/dev/null || true
sleep 0.5

# Run dev server with timeout protection
timeout 30 npm run dev || {
  echo "⚠️  Frontend startup timed out or failed"
  echo "💡 Try: cd frontend && npm run prisma:generate && npm run dev"
  exit 1
}

