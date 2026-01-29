#!/bin/bash
cd "$(dirname "$0")"

echo "🔨 Building project..."
vite build

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Build successful! Starting preview server..."
  echo "📍 Server will be at http://localhost:5173"
  echo ""
  vite preview --host --port 5173
else
  echo "❌ Build failed"
  exit 1
fi
