#!/bin/bash
cd "$(dirname "$0")"

echo "🧹 Cleaning..."
pkill -9 -f vite 2>/dev/null
pkill -9 -f "node.*dev" 2>/dev/null
rm -rf .svelte-kit node_modules/.vite .vite

echo "🚀 Starting server..."
npm run dev
