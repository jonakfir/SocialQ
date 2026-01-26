#!/bin/bash
cd "$(dirname "$0")"

echo "🧹 Cleaning..."
pkill -9 -f "vite dev" 2>/dev/null
rm -rf .svelte-kit/output

echo "🚀 Starting dev server..."
SKIP_ENV_VALIDATION=1 npm run dev
