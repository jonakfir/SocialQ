#!/bin/bash
# Stop all servers

echo "🛑 Stopping all servers..."

pkill -f "node server.js" 2>/dev/null
pkill -f "vite dev" 2>/dev/null

sleep 1

# Check if any are still running
if pgrep -f "node server.js" > /dev/null || pgrep -f "vite dev" > /dev/null; then
    echo "⚠️  Some processes still running, force killing..."
    pkill -9 -f "node server.js" 2>/dev/null
    pkill -9 -f "vite dev" 2>/dev/null
fi

echo "✅ All servers stopped"

